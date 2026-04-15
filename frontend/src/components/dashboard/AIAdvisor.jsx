import { useState } from 'react';
import axios from 'axios';
import { Bot, Sparkles, AlertTriangle, Send } from 'lucide-react';

const API = import.meta.env.VITE_BACKEND_URL;

export default function AIAdvisor() {
  const [briefing, setBriefing] = useState('');
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [chatLog, setChatLog] = useState([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  const fetchBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const res = await axios.get(`${API}/api/advisory/briefing`);
      setBriefing(res.data.briefing);
    } catch (err) {
      console.error(err);
      setBriefing("Failed to parse AI briefing. Ensure Gemini API key is configured.");
    } finally {
      setLoadingBriefing(false);
    }
  };

  const askQuestion = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    const userQ = question;
    setQuestion('');
    setChatLog((prev) => [...prev, { role: 'user', text: userQ }]);
    setAsking(true);

    try {
      const res = await axios.post(`${API}/api/advisory/ask`, { question: userQ });
      setChatLog((prev) => [...prev, { role: 'ai', text: res.data.answer }]);
    } catch (err) {
      console.error(err);
      setChatLog((prev) => [...prev, { role: 'ai', text: "Error: Could not reach AI Advisor." }]);
    } finally {
      setAsking(false);
    }
  };

  const formatText = (txt) => {
      // Very basic markdown bold parsing for simple UI without a markdown library
      return txt.split('\n').map((line, i) => {
          let formattedLine = line;
          if (line.startsWith('## ')) {
             return <h3 key={i} className="text-md font-bold text-gray-800 mt-2 mb-1">{line.replace('##', '').trim()}</h3>;
          }
          if (line.startsWith('# ')) {
             return <h2 key={i} className="text-lg font-bold text-indigo-700 mt-3 mb-2">{line.replace('#', '').trim()}</h2>;
          }
          const parts = line.split(/(\*\*.*?\*\*)/g);
          return (
              <p key={i} className="mb-1 text-sm text-gray-700">
                  {parts.map((p, px) => p.startsWith('**') ? <strong key={px}>{p.replace(/\*\*/g, '')}</strong> : p)}
              </p>
          );
      });
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl shadow border border-indigo-100 p-5 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4 border-b border-indigo-100 pb-3">
        <div className="bg-indigo-600 p-2 rounded-lg text-white">
          <Bot size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Gemini Co-Pilot</h2>
          <p className="text-xs text-indigo-600 font-medium">Strategic AI Logistics Advisor</p>
        </div>
      </div>

      <div className="mb-4">
        <button
          onClick={fetchBriefing}
          disabled={loadingBriefing}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium transition shadow-sm disabled:opacity-50"
        >
          <Sparkles size={16} />
          {loadingBriefing ? 'Analyzing Network...' : 'Generate Executive Briefing'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-[150px] max-h-[300px] pr-2 mb-4 space-y-4">
        {briefing && (
          <div className="bg-white border text-sm p-4 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 text-indigo-700 font-semibold mb-2">
              <AlertTriangle size={15}/> Executive Network Summary
            </div>
            <div className="prose prose-sm font-sans">{formatText(briefing)}</div>
          </div>
        )}

        {chatLog.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`p-3 rounded-xl max-w-[90%] text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
              {msg.role === 'ai' ? formatText(msg.text) : msg.text}
            </div>
          </div>
        ))}
        {asking && (
          <div className="flex items-start">
            <div className="p-3 bg-gray-100 text-gray-500 rounded-xl rounded-bl-none text-xs italic">
              AI is analyzing scenarios...
            </div>
          </div>
        )}
      </div>

      <form onSubmit={askQuestion} className="relative mt-auto">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask What-If (e.g. 'Reroute to Mumbai?')"
          className="w-full bg-white border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          disabled={asking}
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="absolute right-1 top-1 p-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
