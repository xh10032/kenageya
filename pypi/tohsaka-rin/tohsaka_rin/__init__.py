import pathlib
import time
import webbrowser

def main():
    html_path = pathlib.Path(__file__).with_name("index.html")
    url = html_path.as_uri()
    print(f"Opening {url}")
    webbrowser.open(url)
    time.sleep(1.5)

if __name__ == "__main__":
    main()
