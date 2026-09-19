import requests
import time

API_URL = "http://127.0.0.1:8000/transactions/"

dummy_data = [
    {"raw_description": "Netflix", "amount": 15.49, "date": "2026-09-01"},
    {"raw_description": "Netflix", "amount": 15.49, "date": "2026-08-01"}, # Triggers recurring
    {"raw_description": "Uber Eats", "amount": 28.50, "date": "2026-09-10"},
    {"raw_description": "Uber Ride", "amount": 14.20, "date": "2026-09-12"},
    {"raw_description": "Shell Gas", "amount": 42.00, "date": "2026-09-13"},
    {"raw_description": "Spotify Premium", "amount": 10.99, "date": "2026-09-15"},
    {"raw_description": "Spotify Premium", "amount": 10.99, "date": "2026-08-15"}, # Triggers recurring
    {"raw_description": "Whole Foods Market", "amount": 112.30, "date": "2026-09-18"},
    {"raw_description": "Gym Membership", "amount": 50.00, "date": "2026-09-05"},
    {"raw_description": "Steam Games", "amount": 35.00, "date": "2026-09-16"}
]

print("Seeding database...")
for data in dummy_data:
    response = requests.post(API_URL, json=data)
    if response.status_code == 200:
        print(f"Added: {data['raw_description']}")
    else:
        print(f"Failed to add: {data['raw_description']}")
    time.sleep(0.1) # Tiny pause to ensure database locks don't collide
    
print("Done! Refresh your React dashboard.")