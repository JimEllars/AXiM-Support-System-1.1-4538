const fs = require('fs');
const file = './src/components/chat/LiveChatPanel.jsx';
let data = fs.readFileSync(file, 'utf8');

const replacement1 = `  const [inputValue, setInputValue] = useState(() => {
    return localStorage.getItem('chat_draft_' + ticketId) || '';
  });

  useEffect(() => {
    localStorage.setItem('chat_draft_' + ticketId, inputValue);
  }, [inputValue, ticketId]);`;

data = data.replace(/const \[inputValue, setInputValue\] = useState\(''\);/, replacement1);

// When message is sent, clear draft.
const sendMsgCode = `    setInputValue('');
    localStorage.removeItem('chat_draft_' + ticketId);`;

data = data.replace(/setInputValue\(''\);/, sendMsgCode);

fs.writeFileSync(file, data, 'utf8');
