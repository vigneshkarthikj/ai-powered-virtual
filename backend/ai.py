import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DEFAULT_MODEL = "gemini-1.5-flash"


def get_gemini_client():
    """
    Configure Gemini using the API key stored in environment variables
    """
    api_key = os.getenv("GEMINI_API_KEY")

    print("\n========== GEMINI DEBUG ==========")
    print("API KEY FOUND:", api_key[:5] + "..." if api_key else "None")
    print("API KEY EXISTS:", api_key is not None)

    if not api_key:
        print("❌ GEMINI_API_KEY NOT FOUND")
        return False

    try:
        genai.configure(api_key=api_key)
        print("✅ Gemini configured successfully")
        return True
    except Exception as e:
        print("❌ Gemini configuration failed")
        print(repr(e))
        return False


def ask_gemini_chatbot(history, user_question, system_instruction=None):
    if not get_gemini_client():
        return "❌ Gemini configuration failed."

    system_prompt = system_instruction or (
        "You are an AI-Powered Virtual Academic Assistant."
    )

    try:
        print("Creating Gemini model...")
        model = genai.GenerativeModel(
            model_name=DEFAULT_MODEL,
            system_instruction=system_prompt
        )

        # Format history to match Gemini's strict expectations
        formatted_history = []
        for msg in history:
            # Adjust 'role' key names if your DB uses different fields (e.g., 'sender')
            role = "user" if msg.get("role") == "user" else "model"
            content = msg.get("parts") or msg.get("text") or msg.get("content") or ""
            
            formatted_history.append({
                "role": role,
                "parts": [content] if isinstance(content, str) else content
            })

        print("Starting chat...")
        chat = model.start_chat(history=formatted_history)

        print("Sending message...")
        response = chat.send_message(user_question)
        print("Gemini replied successfully.")

        return response.text

    except Exception as e:
        print("FULL GEMINI ERROR:")
        print(repr(e))
        return f"❌ Gemini Error: {repr(e)}"


def generate_quiz(topic, num_questions=5, context_text=None):
    if not get_gemini_client():
        return []

    prompt = f"""
Generate exactly {num_questions} MCQ questions about {topic}.
Return a JSON array containing objects matching this schema:
[
  {{
    "question_text": "string",
    "options": ["string", "string", "string", "string"],
    "correct_answer": "string matching exactly one option",
    "explanation": "string"
  }}
]
"""

    if context_text:
        prompt += f"\n\nContext:\n{context_text[:12000]}"

    try:
        model = genai.GenerativeModel(DEFAULT_MODEL)
        response = model.generate_content(
            prompt,
            generation_config={
                "response_mime_type": "application/json"
            }
        )
        return json.loads(response.text)
    except Exception as e:
        print("Quiz Error:", repr(e))
        return []


def summarize_notes(text, detail_level="medium"):
    if not get_gemini_client():
        return "Gemini configuration failed."

    prompt = f"Summarize these notes.\nDetail level: {detail_level}\n\n{text[:25000]}"

    try:
        model = genai.GenerativeModel(DEFAULT_MODEL)
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print("Summary Error:", repr(e))
        return f"Summary Error: {repr(e)}"


def generate_study_plan(exam_name, days_left, subjects, hours_per_day):
    if not get_gemini_client():
        return "Gemini configuration failed."

    prompt = f"""
Create a comprehensive study plan.
Exam: {exam_name}
Days left: {days_left}
Subjects: {", ".join(subjects)}
Hours per day available: {hours_per_day}
"""

    try:
        model = genai.GenerativeModel(DEFAULT_MODEL)
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print("Planner Error:", repr(e))
        return f"Planner Error: {repr(e)}"


def recommend_resources(topic):
    if not get_gemini_client():
        return []

    prompt = f"""
Recommend exactly six high-quality learning resources for: {topic}.
Return a JSON array containing objects matching this schema:
[
  {{
    "title": "Resource Name",
    "type": "Video/Article/Book/Course",
    "url": "https://example.com",
    "description": "Short explanation of why it is helpful"
  }}
]
"""

    try:
        model = genai.GenerativeModel(DEFAULT_MODEL)
        response = model.generate_content(
            prompt,
            generation_config={
                "response_mime_type": "application/json"
            }
        )
        return json.loads(response.text)
    except Exception as e:
        print("Recommendation Error:", repr(e))
        return []