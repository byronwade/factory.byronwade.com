import React from 'react';

const GeneratedContentDisplay = ({ content }) => {
  if (!content || content.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-2 text-lg font-semibold">Generated Content:</h3>
      {content.map((item, index) => (
        <div key={index} className="p-4 mb-4 bg-gray-100 rounded-md">
          <h4 className="font-semibold">{item.idea}</h4>
          <p className="mb-2 text-sm text-gray-500">Word count: {item.wordCount}</p>
          <pre className="whitespace-pre-wrap">{item.content}</pre>
        </div>
      ))}
    </div>
  );
};

export default GeneratedContentDisplay;

