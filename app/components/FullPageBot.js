'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Loader, Upload } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';

export default function FullPageBot() {
  // State variables
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [emailRequestIndex, setEmailRequestIndex] = useState(null);
  const [emailRequestType, setEmailRequestType] = useState(null);
  const [email, setEmail] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // API base URL
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://96ab-2402-a00-401-70ba-1c14-9e6-498a-1a5c.ngrok-free.app';

  // Initialize clientId and chatId
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Initialize clientId
      let storedClientId = localStorage.getItem('retail_client_id');
      if (!storedClientId) {
        storedClientId = uuidv4();
        localStorage.setItem('retail_client_id', storedClientId);
      }
      setClientId(storedClientId);

      // Initialize chatId
      let storedChatId = localStorage.getItem('chat_id');
      if (storedChatId) {
        setChatId(storedChatId);
        fetchChatHistory(storedChatId);
        setSessionLoading(false);
      } else if (storedClientId) {
        initializeChatSession(storedClientId);
      }
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Initialize chat session
  const initializeChatSession = async (clientUuid) => {
    setSessionLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/start_session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ client_id: clientUuid }),
      });
      const data = await response.json();
      if (response.ok && data.status === 'success') {
        setChatId(data.session_id);
        localStorage.setItem('chat_id', data.session_id);
        setMessages([]);
        await fetchChatHistory(data.session_id);
      } else {
        toast.error(data.error || 'Failed to initialize chat session');
      }
    } catch (error) {
      toast.error('Failed to initialize chat session');
      console.error('Error initializing chat session:', error);
    } finally {
      setSessionLoading(false);
    }
  };

  // Fetch chat history
  const fetchChatHistory = async (id) => {
    if (!id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/chat_history/${id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })));
      } else {
        toast.error(data.error || 'Failed to fetch chat history');
        if (data.error_code === 'INVALID_SESSION') {
          localStorage.removeItem('chat_id');
          initializeChatSession(clientId);
        }
      }
    } catch (error) {
      toast.error('Error fetching chat history');
      console.error('Error fetching chat history:', error);
    }
  };

  // Handle file upload
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
    } else {
      toast.error('Please upload a valid CSV file');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a CSV file to upload');
      return;
    }
    if (!chatId) {
      toast.error('Session not initialized');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', chatId);

    try {
      const response = await fetch(`${API_BASE_URL}/upload_csv`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        toast.success('CSV uploaded and processed successfully');
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        toast.error(data.error || 'Failed to upload CSV');
      }
    } catch (error) {
      toast.error('Failed to upload CSV');
      console.error('Error uploading CSV:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Handle message submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || !chatId || !clientId) return;

    const userMessage = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          session_id: chatId,
          query: userMessage,
          client_id: clientId,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        const assistantMessage = { role: 'assistant', content: data.response };
        setMessages((prev) => {
          const newMessages = [...prev, assistantMessage];
          if (data.response.toLowerCase().includes('frustrating')) {
            setEmailRequestIndex(newMessages.length - 1);
            setEmailRequestType('frustrating');
          }
          else if(data.response.toLowerCase().includes('flagged')){
            setEmailRequestIndex(newMessages.length - 1);
            setEmailRequestType('vip');
          }
          return newMessages;
        });

        if (data.analysis?.needs_ticket || data.analysis?.intent === 'report_issue' || data.analysis?.intent === 'escalate') {
          setEmailRequestIndex(messages.length + 1);
        }
      } else {
        let errorMessage = data.error || 'Something went wrong';
        if (data.error_code === 'NO_DATA') {
          errorMessage = 'Please configure the database or upload product data to continue.';
        } else if (data.error_code === 'INVALID_SESSION' || data.error_code === 'MISSING_SESSION_ID') {
          errorMessage = 'Session expired. Starting a new session...';
          localStorage.removeItem('chat_id');
          initializeChatSession(clientId);
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error('Failed to get response from the server');
      console.error('Error submitting query:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle email submission
  const handleEmailSubmit = async () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    const conversationHistory = messages
      .map((msg) => `${msg.role === 'user' ? 'You' : 'AIRA'}: ${msg.content}`)
      .join('\n');
    const lastQuery = messages.filter((msg) => msg.role === 'user').slice(-1)[0]?.content || '';

    try {
      const response = await fetch(`${API_BASE_URL}/api/create-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          email,
          conversation_history: conversationHistory,
          query: lastQuery,
          type : emailRequestType,
        }),
      });
      const data = await response.json();

      if (data.status === 'success') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: 'Your ticket has been successfully created and shared with respective team. Feel free to ask if there’s anything else I can help you with.',
          },
        ]);
        setEmailRequestIndex(null);
        setEmail('');
        toast.success('Ticket sent successfully!');
      } else {
        toast.error(data.message || 'Failed to send ticket');
      }
    } catch (error) {
      toast.error('Failed to send ticket to the team');
      console.error('Error sending ticket:', error);
    }
  };

  // Handle email cancellation
  const handleCancelEmail = () => {
    setEmailRequestIndex(null);
    setEmail('');
  };

  // Clear chat history
  const clearChat = async () => {
    if (!chatId) {
      toast.error('Session not initialized');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/clear_session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ session_id: chatId }),
      });

      if (response.ok) {
        setMessages([]);
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        localStorage.removeItem('chat_id');
        const newClientId = uuidv4();
        localStorage.setItem('retail_client_id', newClientId);
        setClientId(newClientId);
        setChatId(null);
        initializeChatSession(newClientId);
        toast.success('Chat history cleared');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to clear session');
      }
    } catch (error) {
      toast.error('Failed to clear session');
      console.error('Error clearing chat:', error);
    }
  };

  // Enhanced Markdown components
  const markdownComponents = {
    a: ({ node, ...props }) => (
      <a {...props} style={{ color: '#155dfc', textDecoration: 'underline' }} />
    ),
    h1: ({ node, ...props }) => (
      <h1 {...props} className="text-xl font-bold my-1" />
    ),
    h2: ({ node, ...props }) => (
      <h2 {...props} className="text-lg font-bold my-1" />
    ),
    h3: ({ node, ...props }) => (
      <h3 {...props} className="text-base font-bold my-1" />
    ),
    ul: ({ node, ...props }) => (
      <ul {...props} className="list-disc pl-4 my-1" />
    ),
    ol: ({ node, ...props }) => (
      <ol {...props} className="list-decimal pl-4 my-1" />
    ),
    li: ({ node, ...props }) => (
      <li {...props} className="ml-1 my-0.5" />
    ),
    p: ({ node, ...props }) => (
      <p {...props} className="my-1" />
    ),
    blockquote: ({ node, ...props }) => (
      <blockquote {...props} className="border-l-2 border-blue-300 pl-2 italic my-1" />
    ),
    code: ({ node, inline, ...props }) => (
      inline ? 
        <code {...props} className="bg-gray-100 px-1 rounded text-sm font-mono" /> :
        <code {...props} className="block bg-gray-100 p-1 rounded-md text-sm font-mono overflow-x-auto my-1" />
    ),
    pre: ({ node, ...props }) => (
      <pre {...props} className="bg-gray-100 p-1 rounded-md overflow-x-auto my-1" />
    ),
    table: ({ node, ...props }) => (
      <table {...props} className="border-collapse table-auto w-full my-1 text-sm" />
    ),
    th: ({ node, ...props }) => (
      <th {...props} className="border border-gray-300 px-1 py-0.5 font-bold bg-gray-100" />
    ),
    td: ({ node, ...props }) => (
      <td {...props} className="border border-gray-300 px-1 py-0.5" />
    ),
    em: ({ node, ...props }) => (
      <em {...props} className="italic" />
    ),
    strong: ({ node, ...props }) => (
      <strong {...props} className="font-bold" />
    ),
    hr: ({ node, ...props }) => (
      <hr {...props} className="my-2 border-t border-gray-300" />
    ),
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white p-3 z-10 shadow-sm">
        <div className="w-full flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div>
              <h1 className="font-semibold font-poppins text-lg text-black">Excel Logistics Assistant</h1>
              <p className="text-sm font-bold text-gray-600">AI-Powered Support</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col overflow-hidden">
        {/* Chat Area */}
        <div className="flex-grow overflow-y-auto bg-gray-100 p-4">
          {sessionLoading || !clientId || !chatId ? (
            <div className="h-full flex items-center justify-center text-gray-600">
              <Loader className="animate-spin mr-2" size={24} />
              <p>Initializing session...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-600">
              <p className="text-lg font-medium">Hi I'm AIRA</p>
              <p className="text-center mt-2">How can I help you today?</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index} className="flex flex-col">
                  <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`p-3 break-words max-w-sm sm:max-w-[385px] md:max-w-[960px] lg:max-w-60rem xl:max-w-60rem ${
                        message.role === 'user'
                          ? 'ml-auto text-white rounded-tl-xl rounded-tr-xl rounded-br-none rounded-bl-xl'
                          : message.role === 'system'
                          ? 'bg-gray-100 mx-auto text-center'
                          : 'bg-white ml-7 border-gray-200 rounded-tl-xl rounded-tr-xl rounded-br-xl rounded-bl-none'
                      }`}
                      style={message.role === 'user' ? { backgroundColor: '#155dfc' } : {}}
                    >
                      <div className={`text-sm leading-tight ${message.role === 'user' ? 'text-white' : 'text-gray-800'}`}>
                        <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                  {/* Email input box */}
                  {emailRequestIndex === index && (
                    <div className="mt-2 mb-2 w-full flex justify-start">
                      <div className="p-3 bg-white rounded-lg ml-7 border border-gray-200 max-w-sm sm:max-w-[385px] md:max-w-60rem lg:max-w-60rem xl:max-w-60rem">
                        <p className="text-sm text-gray-700 mb-2">
                        To proceed, please share your email address so I can create a priority ticket for you.You can also “cancel” if you’d prefer to continue chatting her.
                        </p>
                        <div className="flex flex-col gap-2">
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            className="w-full p-2 h-9 rounded-lg text-base border border-gray-300 focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                          <div className="flex w-full gap-2">
                            <button
                              onClick={handleCancelEmail}
                              className="flex-1 px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 text-base rounded-lg transition-colors border border-gray-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleEmailSubmit}
                              className="flex-1 px-4 py-2 text-white text-base rounded-lg transition-colors cursor-pointer"
                              style={{ backgroundColor: '#155dfc' }}
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Profile icon */}
                  {message.role === 'assistant' && (
                    <div className="flex items-center mt-1 ml-7">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-xs font-semibold">AI</span>
                      </div>
                      <span className="text-xs text-gray-500 ml-2">Assistant</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-white p-4 border-t">
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 p-2 rounded-lg focus:outline-none"
              disabled={loading || sessionLoading || emailRequestIndex !== null}
            />
            <button
              type="button"
              onClick={clearChat}
              className="p-2 text-gray-500 hover:text-gray-700"
              disabled={loading || sessionLoading || messages.length === 0}
            >
              <Trash2 size={20} />
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim() || sessionLoading || emailRequestIndex !== null}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader className="animate-spin" size={20} /> : <Send size={20} />}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}