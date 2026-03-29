import React, { useState, useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { X } from 'lucide-react';

export default function InstructionEditorModal({ instruction, onCancel, onSave }) {
  const[content, setContent] = useState(instruction.content || '');

  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],[{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['code-block', 'blockquote'],
      ['clean']
    ]
  }), []);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-[800px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-gray-700 bg-gray-850 text-base font-bold text-gray-100 flex items-center justify-between">
          <span>Edit Preset: {instruction.name}</span>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-0 flex-1 min-h-[400px] flex flex-col bg-gray-900">
           <ReactQuill
             theme="snow"
             value={content}
             onChange={setContent}
             modules={modules}
             className="h-full flex flex-col"
           />
        </div>
        <div className="px-5 py-4 bg-gray-900 border-t border-gray-700 flex justify-end space-x-3">
          <button onClick={onCancel} className="px-4 py-2 hover:bg-gray-700 rounded-lg text-sm text-gray-300 font-medium transition-colors">Cancel</button>
          <button
            onClick={() => onSave({ ...instruction, content })}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white font-medium transition-colors shadow-lg shadow-blue-900/20"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

