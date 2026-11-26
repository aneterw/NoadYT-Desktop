with open('src/main.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start of get_stream_url
start = content.find('fn get_stream_url(input: GetStreamUrlInput) -> Result<StreamResult, String> {')
if start == -1:
    print('Not found')
else:
    print(f'Found at byte {start}')

# Find the start of try_download_audio_only
audio_start = content.find('fn try_download_audio_only')
if audio_start == -1:
    print('try_download_audio_only not found')
else:
    print(f'try_download_audio_only found at {audio_start}')

# Show what's between get_stream_url start and try_download_audio_only
section = content[start:audio_start]
print(f"\n=== Section between get_stream_url and try_download_audio_only ({len(content[start:audio_start])} bytes) ===")
print(repr(content[start:start+500]))
print("...")
print(repr(content[start+1500:start+2500]))