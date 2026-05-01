import os



def get_llm_client(model: str = "llama-3.3-70b-versatile", temperature: float = 0.7, top_p: float = 0.9):
    """
    Returns LLM client with configurable parameters.
    """
    try:
        from langchain_groq import ChatGroq
        
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            print("WARNING: GROQ_API_KEY is not set.")
            return None
        
        return ChatGroq(
            model=model,
            temperature=temperature,
            model_kwargs={
                "top_p": top_p
            },
            api_key=groq_api_key,
            timeout=30,
            max_retries=0
        )
    except Exception as e:
        print(f"Error initializing LLM client: {e}")
        return None


def get_available_groq_models():
    """Curated list of FREE working models only - no dynamic API calls"""
    return [
        {
            "id": "llama-3.3-70b-versatile",
            "name": "Meta / Llama 3.3 70B Versatile",
            "context_window": 131072,
            "max_completion_tokens": 32768
        },
        {
            "id": "llama-3.1-8b-instant",
            "name": "Meta / Llama 3.1 8B Instant",
            "context_window": 131072,
            "max_completion_tokens": 131072
        },
        {
            "id": "meta-llama/llama-4-scout-17b-16e-instruct",
            "name": "Meta / Llama 4 Scout 17B",
            "context_window": 131072,
            "max_completion_tokens": 8192
        }
    ]
