import fitz  # PyMuPDF
import base64
import logging
import os
from typing import List, Dict, Optional
from groq import Groq

logger = logging.getLogger(__name__)

class PDFProcessor:
    def __init__(self):
        self.client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        self.vision_model = "llama-3.2-11b-vision-preview"
        self.max_image_size = 20 * 1024 * 1024  # 20MB

    def _describe_image(self, image_bytes: bytes, image_index: int, page_num: int) -> Optional[str]:
        """Get detailed description of an image using Groq Vision model"""
        try:
            base64_image = base64.b64encode(image_bytes).decode('utf-8')
            
            completion = self.client.chat.completions.create(
                model=self.vision_model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Describe this image in great detail. Include all information, labels, values, relationships, diagrams, charts, graphs, tables. This description will be used by another LLM to create quiz questions. Be specific and thorough."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}",
                                }
                            }
                        ]
                    }
                ],
                temperature=0.1,
                max_tokens=1024
            )
            
            description = completion.choices[0].message.content
            logger.info(f"Successfully described image {image_index} on page {page_num}")
            return description
            
        except Exception as e:
            logger.warning(f"Failed to process image {image_index} on page {page_num}: {str(e)}")
            return None

    def process_pdf(self, pdf_file_bytes: bytes) -> str:
        """
        Process PDF file: extract text, extract images, describe images,
        combine everything into structured document text
        """
        document_parts: List[str] = []
        images_processed = 0
        images_skipped = 0
        images_failed = 0
        
        try:
            doc = fitz.open(stream=pdf_file_bytes, filetype="pdf")
            total_pages = len(doc)
            total_images = sum(len(page.get_images(full=True)) for page in doc)
            
            logger.info(f"Processing PDF with {total_pages} pages, {total_images} total images found")
            
            for page_num, page in enumerate(doc, start=1):
                document_parts.append(f"\n\n--- PAGE {page_num} ---")
                
                # Extract page text with preserved layout
                text = page.get_text(sort=True)
                document_parts.append(text)
                
                # Extract and process images on this page
                images = page.get_images(full=True)
                
                for img_index, img in enumerate(images, start=1):
                    xref = img[0]
                    try:
                        base_image = doc.extract_image(xref)
                        image_bytes = base_image["image"]
                        
                        # Skip very small images (probably icons or decorations)
                        if len(image_bytes) < 1024:
                            images_skipped += 1
                            continue
                            
                        document_parts.append(f"\n\n[IMAGE {img_index} ON PAGE {page_num}]")
                        description = self._describe_image(image_bytes, img_index, page_num)
                        
                        if description:
                            images_processed += 1
                            document_parts.append(f"Description: {description}")
                        else:
                            images_failed += 1
                            document_parts.append("Description: Could not process this image")
                            
                    except Exception as e:
                        images_failed += 1
                        logger.warning(f"Skipping image {img_index} on page {page_num}: {str(e)}")
                        continue
            
            doc.close()
            
            # Combine all parts into single document string
            full_document = "\n".join(document_parts)
            
            logger.info(f"PDF processing complete: {len(full_document)} chars, {images_processed} images processed, {images_skipped} skipped, {images_failed} failed")
            return full_document
            
        except Exception as e:
            logger.error(f"Failed to process PDF: {str(e)}")
            raise RuntimeError(f"PDF processing failed: {str(e)}")