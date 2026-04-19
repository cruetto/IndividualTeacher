# Virtual Environment Setup

## Create and activate venv:

```bash
cd video_importer

# Create virtual environment
python3 -m venv venv

# Activate venv (Linux/macOS)
source venv/bin/activate

# Activate venv (Windows)
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Run importer:
```bash
python youtube_importer.py
```

## Usage workflow:
1. Add new videos to `video_catalog.json` as simple `{ "video_id": "...", "title": "..." }` entries
2. Run the importer
3. Only new videos not already in database will be processed
4. Existing videos are skipped immediately **without any YouTube API calls**

## Important:
Copy your `.env` file from backend folder containing `MONGODB_URI` and `GOOGLE_API_KEY` into this directory before running.