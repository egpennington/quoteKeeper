// src/components/UploadSeedQuotes.jsx
import React from 'react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebase'; // adjust path if different
import quoteSeedData from '../quoteSeedData';

function UploadSeedQuotes() {
  const uploadQuotes = async () => {
    try {
      const existingSnapshot = await getDocs(collection(db, 'quotes'));
      const existingQuotes = existingSnapshot.docs.map(doc =>
        doc.data().quote.toLowerCase().trim()
      );

      const newQuotes = quoteSeedData.filter(q =>
        !existingQuotes.includes(q.quote.toLowerCase().trim())
      );

      for (const quote of newQuotes) {
        await addDoc(collection(db, 'quotes'), {
          ...quote,
          likes: 0,
          isLiked: false,
          createdAt: new Date(), // if you want a timestamp
        });
      }

      console.log(`✅ Uploaded ${newQuotes.length} new quotes.`);
      console.log("Total quotes in seed file:", quoteSeedData.length);

      alert(`Uploaded ${newQuotes.length} new quotes.`);
    } catch (error) {
      console.error('❌ Upload failed:', error);
      alert('Upload failed. Check console.');
    }
  };

  return (
    <button onClick={uploadQuotes}>
      Upload QuoteSeedData
    </button>
  );
}

export default UploadSeedQuotes;
