from flask import Flask, jsonify, request
import os

app = Flask(__name__)

@app.route("/")
def home():
    return jsonify({
        "message": "Aplix backend is running",
        "status": "ok"
    })

@app.route("/jobs")
def get_jobs():
    jobs = [
        {
            "id": "job_001",
            "title": "NDIS Support Worker",
            "company": "CareConnect Services",
            "location": "Sydney, NSW",
            "salary": "$35 - $40/hr",
            "type": "Part-time",
            "match": 95,
            "description": "Support NDIS participants with daily living, appointments, community access and independence goals."
        },
        {
            "id": "job_002",
            "title": "Aged Care Support Worker",
            "company": "My Aged Care",
            "location": "Parramatta, NSW",
            "salary": "$32 - $38/hr",
            "type": "Casual",
            "match": 92,
            "description": "Provide care, companionship and daily support to aged care clients."
        }
    ]

    return jsonify(jobs)

@app.route("/create-resume", methods=["POST"])
def create_resume():
    data = request.json

    job_title = data.get("job_title", "Support Worker")
    company = data.get("company", "Company")

    resume = {
        "summary": f"Compassionate and reliable candidate applying for the position of {job_title} at {company}.",
        "skills": [
            "Client support",
            "Communication",
            "Care planning",
            "Community access"
        ],
        "status": "resume_created"
    }

    return jsonify(resume)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
