const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src', 'pages');
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  const pageName = file.replace('.tsx', '').toLowerCase();
  let modified = false;
  
  // Add import if not exists
  if (!content.includes('useTranslation')) {
    content = 'import { useTranslation } from "react-i18next";\n' + content;
    modified = true;
  }
  
  // Find the component definition to inject useTranslation
  const compRegex = new RegExp(`(const ${file.replace('.tsx', '')}.*?=> {\\s*|function ${file.replace('.tsx', '')}\\(.*?\\) {\\s*)`);
  if (!content.includes('const { t } = useTranslation();')) {
     content = content.replace(compRegex, `$1\n  const { t } = useTranslation();\n`);
     modified = true;
  }
  
  // Replace PageHeader props
  const headerRegex = /<PageHeader\s+eyebrow="([^"]+)"\s+title="([^"]+)"\s+description="([^"]+)"\s*\/>/gs;
  if (content.match(headerRegex)) {
    content = content.replace(headerRegex, `<PageHeader
        eyebrow={t('pages.${pageName}.directory') || "$1"}
        title={t('pages.${pageName}.title')}
        description={t('pages.${pageName}.desc')}
      />`);
    modified = true;
  }

  // Without eyebrow
  const headerRegex2 = /<PageHeader\s+title="([^"]+)"\s+description="([^"]+)"\s*\/>/gs;
  if (content.match(headerRegex2)) {
    content = content.replace(headerRegex2, `<PageHeader
        title={t('pages.${pageName}.title')}
        description={t('pages.${pageName}.desc')}
      />`);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
  }
}
console.log('Done');
