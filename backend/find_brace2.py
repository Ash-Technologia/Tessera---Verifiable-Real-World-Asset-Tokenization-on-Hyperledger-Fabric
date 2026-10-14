with open('src/services/fabric/gateway.service.js', 'r') as f:
    content = f.read()

import re

# Find 'async connect' 
match = re.search(r'async connect\s*\([^)]*\)\s*\{', content)
if match:
    start = match.start()
    print(f'connect method starts at position {start}')
    
    # Now find the matching closing brace
    brace_count = 0
    in_string = False
    string_char = None
    escape = False
    
    for i in range(start, len(content)):
        ch = content[i]
        if not in_string:
            if ch in ('"', "'", '`'):
                in_string = True
                string_char = ch
            elif ch == '{':
                brace_count += 1
            elif ch == '}':
                brace_count -= 1
                if brace_count == 0:
                    print(f'Matching }} found at position {i}')
                    # Show context
                    ctx_start = max(0, i - 20)
                    ctx_end = min(len(content), i + 20)
                    print(f'Context: ...{content[ctx_start:ctx_end]}...')
                    break
        else:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == string_char:
                in_string = False
                string_char = None
    
    print(f'Final brace_count at end of file: {brace_count}')
else:
    print('async connect not found')