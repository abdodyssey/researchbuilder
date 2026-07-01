import os
import shutil

def move_to_root():
    frontend_dir = "frontend"
    for item in os.listdir(frontend_dir):
        src = os.path.join(frontend_dir, item)
        dst = item
        
        # Merge .gitignore
        if item == ".gitignore":
            if os.path.exists(".gitignore"):
                with open(src, "r") as src_file:
                    content = src_file.read()
                with open(".gitignore", "a") as dst_file:
                    dst_file.write("\n" + content)
            else:
                shutil.move(src, dst)
            continue
            
        if item == "vercel.json":
            # Remove "framework": "nextjs" if we added it
            with open(src, "r") as f:
                content = f.read()
            content = content.replace('"framework": "nextjs",\n', '')
            content = content.replace('"framework": "nextjs",', '')
            with open(dst, "w") as f:
                f.write(content)
            continue
            
        if os.path.exists(dst):
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            else:
                os.remove(dst)
                
        shutil.move(src, dst)
        print(f"Moved {src} to {dst}")
        
    try:
        os.rmdir(frontend_dir)
    except:
        pass

if __name__ == "__main__":
    move_to_root()
