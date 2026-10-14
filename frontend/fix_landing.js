const fs = require('fs');

let content = fs.readFileSync('src/pages/LandingPage.jsx', 'utf8');

content = content.replace(/&rarr;/g, '→');
content = content.replace(/&mdash;/g, '—');
content = content.replace(/&ldquo;/g, '"');
content = content.replace(/&rdquo;/g, '"');
content = content.replace(/&lsquo;/g, "'");
content = content.replace(/&rsquo;/g, "'");

fs.writeFileSync('src/pages/LandingPage.jsx', content, 'utf8');
console.log('Fixed LandingPage.jsx');