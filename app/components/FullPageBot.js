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
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState('');
  const [ticketData, setTicketData] = useState(null);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [orderId, setOrderId] = useState(null);
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
          order_id: orderId,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        const assistantMessage = { role: 'assistant', content: data.response };
        setMessages((prev) => {
          const newMessages = [...prev, assistantMessage];
          if (data.response.toLowerCase().includes('unfortunately')) {
            newMessages.push({
              role: 'system',
              content: 'For further assistance, please contact our support team at support@retail.com.',
            });
          }
          return newMessages;
        });

        if (data.order_id) {
          setOrderId(data.order_id);
        }

        if (data.analysis?.needs_ticket || data.analysis?.intent === 'report_issue' || data.analysis?.intent === 'escalate') {
          setTicketData({
            query: userMessage,
            conversation_history: messages.map((m) => `${m.role}: ${m.content}`).join('\n'),
            order_id: orderId || data.order_id,
            intent: data.analysis.intent,
          });
          setShowEmailModal(true);
          setMessages((prev) => [
            ...prev,
            {
              role: 'system',
              content: 'This query requires additional support. Please provide your email so our team can assist you better.',
            },
          ]);
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
    if (!email.trim() || !ticketData) {
      toast.error('Please enter a valid email address');
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setTicketSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/create-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          email,
          query: ticketData.query,
          conversation_history: ticketData.conversation_history,
          order_id: ticketData.order_id,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        toast.success('Support ticket created successfully');
        setShowEmailModal(false);
        setEmail('');
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: `Support ticket created successfully! Our team will contact you at ${email} shortly. Ticket ID: ${data.ticket_id}`,
          },
        ]);
      } else {
        toast.error(data.error || 'Failed to create support ticket');
      }
    } catch (error) {
      toast.error('Error creating support ticket');
      console.error('Error:', error);
    } finally {
      setTicketSubmitting(false);
      setTicketData(null);
    }
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
        setOrderId(null);
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
      <a {...props} style={{ color: '#FF3000', textDecoration: 'underline' }} />
    ),
    h1: ({ node, ...props }) => (
      <h1 {...props} className="text-xl font-bold mt-2 mb-1" />
    ),
    h2: ({ node, ...props }) => (
      <h2 {...props} className="text-lg font-bold mt-2 mb-1" />
    ),
    h3: ({ node, ...props }) => (
      <h3 {...props} className="text-base font-bold mt-2 mb-1" />
    ),
    ul: ({ node, ...props }) => (
      <ul {...props} className="list-disc pl-5 my-1" />
    ),
    ol: ({ node, ...props }) => (
      <ol {...props} className="list-decimal pl-5 my-1" />
    ),
    li: ({ node, ...props }) => (
      <li {...props} className="ml-1 my-0.5 pl-1" />
    ),
    p: ({ node, ...props }) => (
      <p {...props} className="my-1" />
    ),
    blockquote: ({ node, ...props }) => (
      <blockquote {...props} className="border-l-2 border-orange-300 pl-2 italic my-1" />
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
      <header className="bg-white p-3 z-9 shadow-sm">
        <div className="w-full flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div>
              <h1 className="font-semibold font-poppins text-lg text-black">T&L Assistant</h1>
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
              <p className="text-lg font-medium">Welcome to T&L Assistant</p>
              <p className="text-center mt-2">How can I help you today?</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index} className="flex flex-col">
                  <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`p-3 rounded-xl max-w-lg ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : message.role === 'system'
                          ? 'bg-yellow-100 text-gray-800 border border-yellow-300'
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                  {message.role === 'assistant' && (
                    <div className="flex items-center mt-1 ml-2">
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
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
              disabled={loading || sessionLoading}
            />
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="hidden"
            />
            <button
              type="button"
              onClick={triggerFileInput}
              className="p-2 text-gray-500 hover:text-gray-700"
              disabled={loading || sessionLoading}
            >
              <Upload size={20} />
            </button>
            {file && (
              <button
                type="button"
                onClick={handleUpload}
                className="p-2 text-gray-500 hover:text-gray-700"
                disabled={loading || sessionLoading}
              >
                Upload CSV
              </button>
            )}
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
              disabled={loading || !input.trim() || sessionLoading}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader className="animate-spin" size={20} /> : <Send size={20} />}
            </button>
          </form>
        </div>
      </main>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Submit Your Email for Support</h2>
            <p className="text-sm text-gray-600 mb-4">
              We'll create a support ticket and our team will get back to you shortly with assistance.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setEmail('');
                  setTicketData(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                disabled={ticketSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleEmailSubmit}
                disabled={ticketSubmitting || !email.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {ticketSubmitting ? (
                  <>
                    <Loader className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Creating Ticket...
                  </>
                ) : (
                  'Submit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}