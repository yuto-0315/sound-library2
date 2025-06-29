import React, { useState, useRef, useEffect } from 'react';
import './SoundCollection.css';

const SoundCollection = () => {
  const [recordings, setRecordings] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [currentRecording, setCurrentRecording] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioContext, setAudioContext] = useState(null);
  const fileInputRef = useRef(null);
  const animationFrameRef = useRef(null);

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      // 録音中の場合は停止
      if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        if (mediaRecorder.stream) {
          mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
      }
      
      // 作成されたBlobURLをクリーンアップ
      recordings.forEach(recording => {
        if (recording.url && recording.url.startsWith('blob:')) {
          URL.revokeObjectURL(recording.url);
        }
      });
    };
  }, [mediaRecorder, isRecording, recordings]);

  const startRecording = async () => {
    try {
      // iOSでのマイクアクセス改善 - まずテストを実行
      const hasAccess = await testMicrophoneAccess();
      if (!hasAccess) {
        return;
      }

      console.log('録音開始処理中...');
      
      // iPad用の音声設定を最適化
      const audioConstraints = {
        echoCancellation: false, // iPadでは無効にする
        noiseSuppression: false, // iPadでは無効にする  
        autoGainControl: false,  // iPadでは無効にする
        sampleRate: 44100,       // 明示的にサンプルレートを指定
        channelCount: 1          // モノラル録音を明示
      };
      
      console.log('音声制約:', audioConstraints);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints
      });
      
      console.log('録音ストリーム取得成功');
      console.log('ストリーム詳細:', {
        id: stream.id,
        active: stream.active,
        tracks: stream.getTracks().map(track => ({
          id: track.id,
          kind: track.kind,
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings: track.getSettings ? track.getSettings() : 'getSettings not supported'
        }))
      });
      
      // 音声レベル監視のためのAudioContextを設定
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      console.log('AudioContext作成:', {
        state: audioCtx.state,
        sampleRate: audioCtx.sampleRate,
        baseLatency: audioCtx.baseLatency
      });
      
      // AudioContextが停止している場合は再開
      if (audioCtx.state === 'suspended') {
        console.log('AudioContextを再開中...');
        await audioCtx.resume();
        console.log('AudioContext再開完了:', audioCtx.state);
      }
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.8; // スムージングを追加
      source.connect(analyserNode);
      
      console.log('AudioContext接続完了:', {
        analyserFFTSize: analyserNode.fftSize,
        frequencyBinCount: analyserNode.frequencyBinCount,
        smoothingTimeConstant: analyserNode.smoothingTimeConstant
      });
      
      setAudioContext(audioCtx);
      
      // 音声レベル監視開始
      monitorAudioLevel(analyserNode);
      
      // MediaRecorderのオプションを決定
      let recorderOptions = {};
      
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        recorderOptions.mimeType = 'audio/webm;codecs=opus';
        console.log('使用するMIMEタイプ: audio/webm;codecs=opus');
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        recorderOptions.mimeType = 'audio/mp4';
        console.log('使用するMIMEタイプ: audio/mp4');
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        recorderOptions.mimeType = 'audio/wav';
        console.log('使用するMIMEタイプ: audio/wav');
      } else {
        console.log('デフォルトMIMEタイプを使用');
      }
      
      const recorder = new MediaRecorder(stream, recorderOptions);
      console.log('MediaRecorder作成:', {
        mimeType: recorder.mimeType,
        state: recorder.state,
        supportedTypes: {
          'audio/webm;codecs=opus': MediaRecorder.isTypeSupported('audio/webm;codecs=opus'),
          'audio/mp4': MediaRecorder.isTypeSupported('audio/mp4'),
          'audio/wav': MediaRecorder.isTypeSupported('audio/wav')
        }
      });
      
      const chunks = [];

      recorder.ondataavailable = (e) => {
        console.log('録音データ受信:', e.data.size, 'bytes, type:', e.data.type);
        chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        console.log('録音完了 - Blobサイズ:', blob.size, 'bytes, type:', blob.type);
        console.log('チャンク数:', chunks.length, 'chunks');
        setCurrentRecording({
          id: Date.now(),
          url: url,
          audioBlob: blob,
          name: '',
          tags: [],
          createdAt: new Date()
        });
        
        // 音声レベル監視停止
        setAudioLevel(0);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };

      recorder.start();
      console.log('録音開始:', recorder.state);
      setMediaRecorder(recorder);
      setIsRecording(true);
      console.log('録音開始完了');
      
    } catch (error) {
      console.error('録音の開始に失敗しました:', error);
      
      let errorMessage = '録音を開始できませんでした。';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'マイクの使用が拒否されました。ブラウザの設定でマイクアクセスを許可してください。';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'マイクが見つかりません。デバイスにマイクが接続されているか確認してください。';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'お使いのブラウザは録音機能をサポートしていません。';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'マイクが他のアプリケーションで使用中の可能性があります。';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setMediaRecorder(null);
    }
    
    // 音声レベル監視を停止
    setAudioLevel(0);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // AudioContextをクリーンアップ
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(error => {
        console.warn('SoundCollection AudioContext のクローズに失敗:', error);
      });
      setAudioContext(null);
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

  // マイクアクセステスト機能（iOSでの問題対策）
  const testMicrophoneAccess = async () => {
    try {
      console.log('マイクアクセステスト開始');
      
      // HTTPS接続チェック
      if (!checkHTTPS()) {
        alert('🔒 録音機能を使用するにはHTTPS接続が必要です。\n\niPhoneでは特に、セキュアな接続が必要となります。');
        return false;
      }
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('お使いのブラウザは録音機能をサポートしていません。');
      }

      // まずマイクの権限状態を確認
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ name: 'microphone' });
          console.log('マイク権限状態:', permission.state);
          
          if (permission.state === 'denied') {
            alert('マイクアクセスが拒否されています。ブラウザの設定からマイクの使用を許可してください。');
            return false;
          }
        } catch (permError) {
          console.log('権限確認はサポートされていません:', permError);
        }
      }

      // 実際にマイクアクセスをテスト
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // すぐにストリームを停止
      stream.getTracks().forEach(track => track.stop());
      console.log('マイクアクセステスト成功');
      return true;
      
    } catch (error) {
      console.error('マイクアクセステスト失敗:', error);
      
      let errorMessage = 'マイクにアクセスできません。';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'マイクの使用が拒否されました。ブラウザの設定でマイクアクセスを許可してください。\n\niPhoneの場合：\n1. Safari設定 > プライバシーとセキュリティ > マイク\n2. このサイトを許可に設定';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'マイクが見つかりません。';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'お使いのブラウザは録音機能をサポートしていません。';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
      return false;
    }
  };

  // HTTPS接続チェック（iOSでの録音に必要）
  const checkHTTPS = () => {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return false;
    }
    return true;
  };

  // 音声レベル監視関数
  const monitorAudioLevel = (analyserNode) => {
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    console.log('音声レベル監視開始 - bufferLength:', bufferLength);
    
    const updateLevel = () => {
      if (!isRecording) {
        console.log('録音停止のため音声レベル監視終了');
        return;
      }
      
      // 時間領域データを取得（周波数領域ではなく）
      analyserNode.getByteTimeDomainData(dataArray);
      
      // デバッグ用：最初の10サンプルをログ出力（最初の数秒のみ）
      if (Math.random() < 0.01) { // 1%の確率でログ出力
        console.log('音声データサンプル:', Array.from(dataArray.slice(0, 10)));
      }
      
      // RMS（二乗平均平方根）を計算
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const sample = (dataArray[i] - 128) / 128; // -1 to 1の範囲に正規化
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / bufferLength);
      
      // デシベルに変換して0-100の範囲にマッピング
      const db = 20 * Math.log10(rms + 0.0001); // 0.0001は-∞を防ぐため
      const level = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)); // -60dBを0%、0dBを100%に
      
      // デバッグ用：レベルをログ出力（時々）
      if (Math.random() < 0.01) { // 1%の確率でログ出力
        console.log('音声レベル - RMS:', rms, 'dB:', db, 'Level:', level);
      }
      
      setAudioLevel(level);
      
      if (isRecording) {
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      }
    };
    
    updateLevel();
  };

  return (
    <div className="sound-collection">
      <h2>🎤 音あつめページ</h2>
      <p>身の回りにある音を録音したり、音ファイルをアップロードして音素材を集めましょう！</p>
      
      <div className="collection-actions">
        <div className="recording-section card">
          <h3>🎙️ 音を録音する</h3>
          
          {/* iOS用の説明 */}
          <div className="ios-notice">
            <p>📱 <strong>iPhone/iPadをお使いの方へ：</strong></p>
            <p>録音ボタンを押すとマイクの使用許可を求めるダイアログが表示されます。「許可」を選択してください。</p>
            <p>ダイアログが表示されない場合は、Safari設定 → プライバシーとセキュリティ → マイク でこのサイトを許可してください。</p>
          </div>
          
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
            <div className="recording-status">
              <div className="recording-indicator">
                <div className="pulse-dot"></div>
                録音中...
              </div>
              <div className="audio-level-meter">
                <div className="audio-level-label">音声入力レベル:</div>
                <div className="audio-level-bar">
                  <div 
                    className="audio-level-fill" 
                    style={{ width: `${audioLevel}%` }}
                  ></div>
                </div>
                <div className="audio-level-value">{Math.round(audioLevel)}%</div>
              </div>
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
      
      <audio 
        controls 
        src={recording.url} 
        className="audio-preview"
        onError={(e) => {
          console.error('音声プレビューの読み込みエラー:', e);
        }}
      />
      
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
      <audio 
        controls 
        src={recording.url}
        onError={(e) => {
          console.error('音声カードの読み込みエラー:', e, 'recording:', recording.name);
        }}
      />
    </div>
  );
};

export default SoundCollection;
