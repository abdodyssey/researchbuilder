import os
import shutil

def move_back():
    items = [
        "public", "next.config.ts", "postcss.config.mjs", "eslint.config.mjs",
        "tsconfig.json", "next-env.d.ts", "src", "package.json", "node_modules",
        "package-lock.json", ".next", "tsconfig.tsbuildinfo"
    ]
    
    for item in items:
        if os.path.exists(item):
            dst = os.path.join("frontend", item)
            # if dst exists, remove it or skip
            if os.path.exists(dst):
                if os.path.isdir(dst):
                    shutil.rmtree(dst)
                else:
                    os.remove(dst)
            shutil.move(item, "frontend/")
            print(f"Moved {item} to frontend/")

    # Also move api/ and requirements.txt
    if os.path.exists("api"):
        dst_api = os.path.join("frontend", "api")
        if os.path.exists(dst_api):
            shutil.rmtree(dst_api)
        shutil.move("api", "frontend/")
        print("Moved api to frontend/")
        
    if os.path.exists("requirements.txt"):
        dst_req = os.path.join("frontend", "requirements.txt")
        if os.path.exists(dst_req):
            os.remove(dst_req)
        shutil.move("requirements.txt", "frontend/")
        print("Moved requirements.txt to frontend/")

if __name__ == "__main__":
    move_back()
