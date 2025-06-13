import React, { useState, useRef } from 'react';
import './SoundCollection.css';

const SoundCollection = () => {
  const [recordings, setRecordings] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [currentRecording, setCurrentRecording] = useState(null);
  const fileInputRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setCurrentRecording({
          id: Date.now(),
          url: url,
          audioBlob: blob,
          name: '',
          tags: [],
          createdAt: new Date()
        });
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('録音の開始に失敗しました:', error);
      alert('マイクへのアクセスが許可されていません。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  // Blobを Base64 に変換する関数
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const saveRecording = async (name, tags) => {
    if (currentRecording && name.trim()) {
      try {
        // Blobをbase64に変換
        const base64Data = await blobToBase64(currentRecording.audioBlob);
        
        const savedRecording = {
          ...currentRecording,
          name: name.trim(),
          tags: tags.filter(tag => tag.trim()).map(tag => tag.trim()),
          audioData: base64Data, // base64データを保存
          // audioBlobは一時的なものなので削除
          audioBlob: undefined
        };
        
        setRecordings([...recordings, savedRecording]);
        setCurrentRecording(null);
        
        // LocalStorageに保存（audioBlobは除外）
        const existingRecordings = JSON.parse(localStorage.getItem('soundRecordings') || '[]');
        const recordingToSave = { ...savedRecording };
        delete recordingToSave.audioBlob; // Blobは保存しない
        localStorage.setItem('soundRecordings', JSON.stringify([...existingRecordings, recordingToSave]));
      } catch (error) {
        console.error('録音の保存に失敗しました:', error);
        alert('録音の保存に失敗しました。再度お試しください。');
      }
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      const url = URL.createObjectURL(file);
      setCurrentRecording({
        id: Date.now(),
        url: url,
        audioBlob: file,
        name: file.name.replace(/\.[^/.]+$/, ''),
        tags: [],
        createdAt: new Date()
      });
    }
  };

  return (
    <div className="sound-collection">
      <h2>🎤 音あつめページ</h2>
      <p>身の回りにある音を録音したり、音ファイルをアップロードして音素材を集めましょう！</p>
      
      <div className="collection-actions">
        <div className="recording-section card">
          <h3>🎙️ 音を録音する</h3>
          <div className="recording-controls">
            {!isRecording ? (
              <button 
                className="button-primary large-button record-btn"
                onClick={startRecording}
              >
                🔴 録音開始
              </button>
            ) : (
              <button 
                className="button-secondary large-button stop-btn"
                onClick={stopRecording}
              >
                ⏹️ 録音停止
              </button>
            )}
          </div>
          {isRecording && (
            <div className="recording-indicator">
              <div className="pulse-dot"></div>
              録音中...
            </div>
          )}
        </div>

        <div className="upload-section card">
          <h3>📁 音ファイルをアップロード</h3>
          <button 
            className="button-secondary large-button"
            onClick={() => fileInputRef.current?.click()}
          >
            📂 ファイルを選択
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {currentRecording && (
        <RecordingEditor 
          recording={currentRecording}
          onSave={saveRecording}
          onCancel={() => setCurrentRecording(null)}
        />
      )}

      <div className="recent-recordings">
        <h3>📝 最近録音した音</h3>
        {recordings.length === 0 ? (
          <p className="no-recordings">まだ録音した音がありません。上の録音ボタンから始めましょう！</p>
        ) : (
          <div className="recordings-grid">
            {recordings.map(recording => (
              <SoundCard key={recording.id} recording={recording} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const RecordingEditor = ({ recording, onSave, onCancel }) => {
  const [name, setName] = useState(recording.name);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(recording.tags);

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      addTag();
    }
  };

  return (
    <div className="recording-editor card">
      <h3>✏️ 音に名前をつけよう</h3>
      
      <audio controls src={recording.url} className="audio-preview" />
      
      <div className="form-group">
        <label htmlFor="soundName">音の名前:</label>
        <input
          id="soundName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: ピアノの音、雨の音"
          className="sound-name-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="soundTags">タグ:</label>
        <div className="tag-input-container">
          <input
            id="soundTags"
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="例: 楽器、自然"
            className="tag-input"
          />
          <button onClick={addTag} className="add-tag-btn">追加</button>
        </div>
        
        {tags.length > 0 && (
          <div className="tags-display">
            {tags.map(tag => (
              <span key={tag} className="tag">
                {tag}
                <button onClick={() => removeTag(tag)} className="remove-tag">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="editor-actions">
        <button 
          onClick={() => onSave(name, tags)}
          className="button-primary"
          disabled={!name.trim()}
        >
          💾 保存
        </button>
        <button onClick={onCancel} className="button-secondary">
          ❌ キャンセル
        </button>
      </div>
    </div>
  );
};

const SoundCard = ({ recording }) => {
  return (
    <div className="sound-card">
      <div className="sound-info">
        <h4>{recording.name}</h4>
        <p className="sound-date">
          {new Date(recording.createdAt).toLocaleDateString('ja-JP')}
        </p>
        {recording.tags.length > 0 && (
          <div className="sound-tags">
            {recording.tags.map(tag => (
              <span key={tag} className="tag small">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <audio controls src={recording.url} />
    </div>
  );
};

export default SoundCollection;
