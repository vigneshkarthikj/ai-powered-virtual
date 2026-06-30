import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DEFAULT_MODEL = "gemini-1.5-flash"


def get_gemini_client():
    """
    Configure Gemini using the API key stored in Render/.env
    """

    api_key = os.getenv("GEMINI_API_KEY")

    print("\n========== GEMINI DEBUG ==========")
    print("API KEY FOUND:", api_key)
    print("API KEY EXISTS:", api_key is not None)
    print("API KEY LENGTH:", len(api_key) if api_key else 0)

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

        print("Starting chat...")

        chat = model.start_chat(history=history)

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

Return ONLY JSON.

Each object must contain:

question_text
options
correct_answer
explanation
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

        print("Quiz Error:")
        print(repr(e))
        return []


def summarize_notes(text, detail_level="medium"):

    if not get_gemini_client():
        return "Gemini configuration failed."

    prompt = f"""
Summarize these notes.

Detail level:
{detail_level}

{text[:25000]}
"""

    try:

        model = genai.GenerativeModel(DEFAULT_MODEL)

        response = model.generate_content(prompt)

        return response.text

    except Exception as e:

        print("Summary Error:")
        print(repr(e))
        return f"Summary Error: {repr(e)}"


def generate_study_plan(exam_name, days_left, subjects, hours_per_day):

    if not get_gemini_client():
        return "Gemini configuration failed."

    prompt = f"""
Create a study plan.

Exam:
{exam_name}

Days:
{days_left}

Subjects:
{", ".join(subjects)}

Hours per day:
{hours_per_day}
"""

    try:

        model = genai.GenerativeModel(DEFAULT_MODEL)

        response = model.generate_content(prompt)

        return response.text

    except Exception as e:

        print("Planner Error:")
        print(repr(e))
        return f"Planner Error: {repr(e)}"


def recommend_resources(topic):

    if not get_gemini_client():
        return []

    prompt = f"""
Recommend six learning resources for:

{topic}

Return ONLY JSON.
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

        print("Recommendation Error:")
        print(repr(e))
        return []
    