const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src', 'pages');
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  const pageName = file.replace('.tsx', '').toLowerCase();
  
  // Add import if not exists
  if (!content.includes('useTranslation')) {
    content = content.replace(/(import React.*?;\n)/, '$1import { useTranslation } from "react-i18next";\n');
  }
  
  // Find the component definition to inject useTranslation
  // E.g., const Dashboard: React.FC = () => { or function Dashboard() {
  const compRegex = new RegExp(`(const ${file.replace('.tsx', '')}.*?=> {\\s*|function ${file.replace('.tsx', '')}\\(.*?\\) {\\s*)`);
  if (!content.includes('const { t } = useTranslation();')) {
     content = content.replace(compRegex, `$1\n  const { t } = useTranslation();\n`);
  }
  
  // Replace PageHeader props
  const headerRegex = /<PageHeader\s+eyebrow="([^"]+)"\s+title="([^"]+)"\s+description="([^"]+)"\s*\/>/s;
  const match = content.match(headerRegex);
  if (match) {
    const eyebrow = match[1];
    const newHeader = `<PageHeader
        eyebrow={t('pages.${pageName}.directory') || "${eyebrow}"}
        title={t('pages.${pageName}.title')}
        description={t('pages.${pageName}.desc')}
      />`;
    content = content.replace(headerRegex, newHeader);
  }

  // Without eyebrow
  const headerRegex2 = /<PageHeader\s+title="([^"]+)"\s+description="([^"]+)"\s*\/>/s;
  const match2 = content.match(headerRegex2);
  if (match2) {
    const newHeader2 = `<PageHeader
        title={t('pages.${pageName}.title')}
        description={t('pages.${pageName}.desc')}
      />`;
    content = content.replace(headerRegex2, newHeader2);
  }

  fs.writeFileSync(filePath, content);
}
console.log('Done');
