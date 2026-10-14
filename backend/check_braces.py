with open('src/services/fabric/gateway.service.js', 'r') as f:
    content = f.read()

brace_count = 0
paren_count = 0
bracket_count = 0
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
        elif ch == '}':
            brace_count -= 1
            if brace_count < 0:
                print(f'Unmatched }} at position {i}')
                break
        elif ch == '(':
            paren_count += 1
        elif ch == ')':
            paren_count -= 1
        elif ch == '[':
            bracket_count += 1
        elif ch == ']':
            bracket_count -= 1
    else:
        if escape:
            escape = False
        elif ch == '\\':
            escape = True
        elif ch == string_char:
            in_string = False
            string_char = None

print(f'Final brace_count: {brace_count}')
print(f'Final paren_count: {paren_count}')
print(f'Final bracket_count: {bracket_count}')