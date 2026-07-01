import time
import requests
import json
import base64
import os

def main():
    print("Testing Template Library Pipeline...")
    
    # 1. Read a mock draft file from outputs to use as test input
    draft_base_path = "output/draft_311de1a3-026e-47a2-ba40-8442fd6a3e00.docx"
    if not os.path.exists(draft_base_path):
        print(f"Error: mock draft {draft_base_path} not found.")
        return
        
    with open(draft_base_path, "rb") as f:
        draft_bytes = f.read()
    draft_base64 = base64.b64encode(draft_bytes).decode("utf-8")
    
    # 2. Get login token by registering a temporary test user
    test_email = f"test_lib_{int(time.time())}@example.com"
    reg_url = "http://localhost:8000/api/auth/register"
    reg_data = {
        "email": test_email,
        "password": "password123",
        "full_name": "Test User Library"
    }
    
    print(f"Registering test user: {test_email}...")
    reg_resp = requests.post(reg_url, json=reg_data)
    if reg_resp.status_code != 200:
        print(f"Registration failed: {reg_resp.text}")
        return
        
    token = reg_resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # 3. Call GET /api/templates to verify library endpoint
    print("Testing GET /api/templates...")
    tpl_resp = requests.get("http://localhost:8000/api/templates", headers=headers)
    if tpl_resp.status_code != 200:
        print(f"Templates fetch failed: {tpl_resp.text}")
        return
        
    templates = tpl_resp.json()
    print("Available templates in library:")
    for tpl in templates:
        print(f"- {tpl['id']}: {tpl['name']}")
        
    # 4. Start pipeline with template_id="jurnal_komputer_sinta"
    gen_url = "http://localhost:8000/api/generate"
    gen_data = {
        "tema": "Penerapan Machine Learning untuk Diagnosa Penyakit Jantung",
        "bahasa": "id",
        "template_id": "jurnal_komputer_sinta",
        "draft_file_base64": draft_base64,
        "draft_file_name": "draft_jantung.docx",
        "is_draft_review": True
    }
    
    print("Starting pipeline using template_id='jurnal_komputer_sinta'...")
    gen_resp = requests.post(gen_url, json=gen_data, headers=headers)
    if gen_resp.status_code != 200:
        print(f"Start pipeline failed: {gen_resp.text}")
        return
        
    pipeline_id = gen_resp.json()["pipeline_id"]
    print(f"Pipeline started successfully. ID: {pipeline_id}")
    
    # 5. Poll status until done
    status_url = f"http://localhost:8000/api/status/{pipeline_id}"
    print("Polling status...")
    for i in range(30):
        time.sleep(3)
        stat_resp = requests.get(status_url, headers=headers)
        if stat_resp.status_code != 200:
            print(f"Status check failed: {stat_resp.text}")
            break
            
        data = stat_resp.json()
        status = data.get("status")
        print(f"Iteration {i+1}: status = {status}")
        if status in ["completed", "failed"]:
            break
            
    print("Test finished.")

if __name__ == "__main__":
    main()
