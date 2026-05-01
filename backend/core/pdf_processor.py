import fitz  # PyMuPDF
import base64
import logging
import os
from groq import Groq

logger = logging.getLogger(__name__)

class PDFProcessor:
    def __init__(self):
        self.client = Groq(api_key=os.environ.get("GROQ_API_KEY"), max_retries=0)
        self.vision_model = os.environ.get(
            "GROQ_VISION_MODEL",
            "meta-llama/llama-4-scout-17b-16e-instruct"
        )
        self.max_image_size = 20 * 1024 * 1024  # 20MB

    def _describe_image(self, image_bytes, image_index, page_num, mime_type="image/png"):
        """Get detailed description of an image using Groq Vision model"""
        base64_image = base64.b64encode(image_bytes).decode('utf-8')

        try:
            completion = self.client.chat.completions.create(
                model=self.vision_model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "Describe this rendered PDF page in detail for quiz generation. "
                                    "Focus on exercises, diagrams, charts, screenshots, formulas, "
                                    "tables, labels, values, and visual relationships. Ignore purely "
                                    "decorative elements."
                                )
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{base64_image}",
                                }
                            }
                        ]
                    }
                ],
                temperature=0.1,
                max_tokens=1024
            )

            description = completion.choices[0].message.content
            logger.info("Visual description succeeded for page %s", page_num)
            return description

        except Exception as e:
            error_summary = self._summarize_error(e)
            message = (
                f"Visual description failed for page {page_num} "
                f"with vision model '{self.vision_model}': {error_summary}"
            )
            logger.warning(message)
            raise RuntimeError(message) from e

    @staticmethod
    def _summarize_error(error):
        raw_message = str(error).splitlines()[0]
        if len(raw_message) > 500:
            return raw_message[:500] + "..."
        return raw_message

    def _page_has_relevant_images(self, doc, page):
        for img in page.get_images(full=True):
            try:
                image_bytes = doc.extract_image(img[0])["image"]
            except Exception:
                continue

            if len(image_bytes) >= 1024:
                return True

        return False

    def _render_page_image(self, page, page_num):
        for zoom in (1.5, 1.0, 0.75):
            pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            image_bytes = pixmap.tobytes("png")
            if len(image_bytes) <= self.max_image_size:
                return image_bytes

        raise RuntimeError(
            f"Rendered page {page_num} image is larger than {self.max_image_size} bytes"
        )

    def _describe_page_visuals(self, doc, page, page_num):
        if not self._page_has_relevant_images(doc, page):
            return None

        logger.info("Rendering page %s for visual description", page_num)
        page_image = self._render_page_image(page, page_num)
        return self._describe_image(
            page_image,
            "page",
            page_num,
            mime_type="image/png",
        )

    def process_pdf(self, pdf_file_bytes):
        """
        Process PDF file: extract text, render visually relevant pages,
        describe page visuals, and combine everything into structured document text.
        """
        document_parts = []
        pages_described = 0
        pages_skipped = 0
        pages_failed = 0

        try:
            doc = fitz.open(stream=pdf_file_bytes, filetype="pdf")
            total_pages = len(doc)
            total_images = sum(len(page.get_images(full=True)) for page in doc)

            logger.info(f"Processing PDF with {total_pages} pages, {total_images} total images found")

            for page_num, page in enumerate(doc, start=1):
                logger.info("Processing PDF page %s/%s", page_num, total_pages)
                document_parts.append(f"\n\n--- PAGE {page_num} ---")

                text = page.get_text(sort=True)
                logger.info("Extracted %s text characters from page %s", len(text), page_num)
                document_parts.append(text)

                try:
                    description = self._describe_page_visuals(doc, page, page_num)
                    if description:
                        pages_described += 1
                        logger.info("Added visual description for page %s", page_num)
                        document_parts.append(f"\n\n[PAGE {page_num} VISUAL DESCRIPTION]")
                        document_parts.append(f"Description: {description}")
                    else:
                        pages_skipped += 1
                        logger.info("No relevant visual description needed for page %s", page_num)
                except Exception as e:
                    pages_failed += 1
                    logger.warning(
                        "Skipping visual description for page %s after %s described "
                        "and %s failed page(s): %s",
                        page_num,
                        pages_described,
                        pages_failed,
                        str(e),
                    )
                    continue

            doc.close()

            full_document = "\n".join(document_parts)

            logger.info(
                "PDF processing complete: %s chars, %s pages described, %s pages skipped, %s pages failed",
                len(full_document),
                pages_described,
                pages_skipped,
                pages_failed,
            )
            return full_document

        except Exception as e:
            logger.error(f"Failed to process PDF: {str(e)}")
            raise RuntimeError(f"PDF processing failed: {str(e)}")
