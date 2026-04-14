"""
Migrate all existing videos directly from RS_vscode ChromaDB into MongoDB
This will import ALL pre-processed videos, transcripts, embeddings - everything!
No YouTube API calls needed.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import chromadb
from database import connect_to_db, add_video_embeddings

def main():
    print("=" * 70)
    print("CHROMADB TO MONGODB MIGRATION")
    print("Import all existing videos from RS_vscode")
    print("=" * 70)
    
    # Connect to databases
    connect_to_db()
    
    # Load ChromaDB from RS_vscode
    chroma_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "RS_vscode", "chroma_db")
    
    if not os.path.exists(chroma_path):
        print(f"❌ ChromaDB not found at: {chroma_path}")
        print("Please make sure RS_vscode folder is in the project root")
        return
    
    print(f"\nLoading ChromaDB from: {chroma_path}")
    client = chromadb.PersistentClient(path=chroma_path)
    
    try:
        collection = client.get_collection(name="video_recommendations")
    except:
        print("❌ Collection 'video_recommendations' not found")
        return
    
    print(f"✅ Found collection with {collection.count()} chunks")
    
    # Get all data
    all_data = collection.get(include=['embeddings', 'metadatas', 'documents'])
    
    video_chunks = {}
    
    # Group by video_id
    for idx in range(len(all_data['ids'])):
        metadata = all_data['metadatas'][idx]
        video_id = metadata['video_id']
        
        if video_id not in video_chunks:
            video_chunks[video_id] = {
                'title': metadata['video_title'],
                'chunks': []
            }
        
        video_chunks[video_id]['chunks'].append({
            'video_id': video_id,
            'video_title': metadata['video_title'],
            'text': all_data['documents'][idx],
            'start': metadata['start'],
            'end': metadata['end'],
            'embedding': all_data['embeddings'][idx].tolist()
        })
    
    print(f"\n✅ Found {len(video_chunks)} unique videos to migrate:\n")
    
    total_added = 0
    
    for video_id, data in video_chunks.items():
        print(f"Migrating: {data['title']}")
        print(f"   Chunks: {len(data['chunks'])}")
        
        added = add_video_embeddings(video_id, data['title'], data['chunks'])
        total_added += added
        
        print(f"   ✅ Imported {added} chunks\n")
    
    print("=" * 70)
    print("✅ MIGRATION COMPLETED SUCCESSFULLY!")
    print(f"✅ Total videos imported: {len(video_chunks)}")
    print(f"✅ Total vector chunks added: {total_added}")
    print("=" * 70)
    print("\n✅ ALL RS_vscode videos are now in MongoDB!")
    print("✅ Recommendation system is READY TO USE!")

if __name__ == "__main__":
    main()