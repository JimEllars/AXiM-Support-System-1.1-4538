import re

with open("src/components/tickets/MessageThread.jsx", "r") as f:
    content = f.read()

# Replace the existing scroll logic
old_scroll_logic = """  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Trigger whenever messages array updates"""

new_scroll_logic = """  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (!messagesEndRef.current) return;

    // Calculate if user is manually scrolled up
    const isNearBottom = (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 250;

    if (isInitialLoad) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
      setIsInitialLoad(false);
    } else if (isNearBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]); // Fires on message array updates"""

content = content.replace(old_scroll_logic, new_scroll_logic)

with open("src/components/tickets/MessageThread.jsx", "w") as f:
    f.write(content)
