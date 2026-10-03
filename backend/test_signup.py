import requests

response = requests.post(
    "http://127.0.0.1:5000/signup",
    json={"full_name": "Test User", "email": "test@test.com", "password": "test123"}
)

print("Status code:", response.status_code)
print("Response:", response.text)