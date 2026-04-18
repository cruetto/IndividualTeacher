# Youtube Transcriptions Importer

Minimal importer for `jamescalam/youtube-transcriptions` dataset.
All segments include native `start` and `end` timestamps.

### Usage:

```bash
# 1. Download dataset
cd backend/video_importer
git clone https://huggingface.co/datasets/jamescalam/youtube-transcriptions

# 2. Generate embeddings and import into MongoDB
cd backend/video_importer
python3 import_embeddings.py
```

### Features:
✅ Uses original time ranges directly from dataset
✅ Checks if video still exists before import
✅ Streaming processing (no high memory usage)
✅ No temporary files
✅ English only