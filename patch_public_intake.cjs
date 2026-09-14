const fs = require('fs');
const file = './src/pages/PublicIntake.jsx';
let data = fs.readFileSync(file, 'utf8');

const handleFileChangeReplacement = `const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.log'];
      const extension = '.' + selectedFile.name.split('.').pop().toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        setFileError('Invalid file type. Allowed: .pdf, .png, .jpg, .txt, .log');
        setFile(null);
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setFileError('File size exceeds the 10MB limit.');
        setFile(null);
      } else {
        setFileError('');
        setFile(selectedFile);
      }
    }
  };`;

data = data.replace(/const handleFileChange = \(e\) => \{[\s\S]*?\};/, handleFileChangeReplacement);
data = data.replace('Attachment (Optional, Max 5MB)', 'Attachment (Optional, Max 10MB)');
fs.writeFileSync(file, data, 'utf8');
