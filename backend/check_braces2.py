with open('src/services/fabric/gateway.service.js', 'r') as f:
    content = f.read()

brace_count = 0
in_string = False
string_char = None
escape = False

for i, ch in enumerate(content):
    if not in_string:
        if ch in ('"', "'", '`'):
            in_string = True
            string_char = ch
        elif ch == '{':
            brace_count += 1
            if brace_count > 5:
                # Show context around this brace
                start = max(0, i - 50)
                end = min(len(content), i + 50)
                print(f'brace_count={brace_count} at pos {i}: ...{content[start:end]}...')
        elif ch == '}':
            brace_count -= 1
            if brace_count > 5:
                start = max(0, i - 50)
                end = min(len(content), i + 50)
                print(f'brace_count={brace_count} at pos {i}: ...{content[start:end]}...')
    else:
        if escape:
            escape = False
        elif ch == '\\':
            escape = True
        elif ch == string_char:
            in_string = False
            string_char = None

print(f'Final brace_count: {brace_count}')