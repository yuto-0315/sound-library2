import React, { useState, useRef, useEffect } from 'react';
import './DAWPage.css';

const DAWPage = () => {
  const [tracks, setTracks] = useState([{ id: 1, name: 'トラック 1', clips: [] }]);
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioContext, setAudioContext] = useState(null);
  const [trackHeight] = useState(80);
  const [playingAudios, setPlayingAudios] = useState(new Map());
  const [startPlayTime, setStartPlayTime] = useState(null);
  const [error, setError] = useState(null);
  const [sounds, setSounds] = useState([]);
  const [showSoundPanel, setShowSoundPanel] = useState(true);
  const timelineRef = useRef(null);
  const playheadRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    // Web Audio API の初期化
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    setAudioContext(ctx);
    
    // LocalStorageから音素材を読み込み
    loadSounds();
    
    return () => {
      if (ctx) {
        ctx.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // 音素材をLocalStorageから読み込み
  const loadSounds = () => {
    const savedSounds = JSON.parse(localStorage.getItem('soundRecordings') || '[]');
    
    // audioDataからBlobを復元
    const soundsWithBlob = savedSounds.map(sound => {
      if (sound.audioData) {
        try {
          const blob = base64ToBlob(sound.audioData, 'audio/wav');
          return { ...sound, audioBlob: blob };
        } catch (error) {
          console.error('音声データの復元に失敗:', error);
          return sound;
        }
      }
      return sound;
    });
    
    setSounds(soundsWithBlob);
  };

  // Base64 を Blob に変換する関数
  const base64ToBlob = (base64, mimeType) => {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  // 音声ファイルの継続時間を取得
  const getAudioDuration = (audioBlob) => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration * 100); // 秒からピクセルに変換（1秒=100px）
      });
      audio.addEventListener('error', () => {
        resolve(200); // エラーの場合はデフォルト値
      });
      audio.src = URL.createObjectURL(audioBlob);
    });
  };

  // プレイヘッドのアニメーション更新
  const updatePlayhead = () => {
    if (isPlaying && startPlayTime) {
      const elapsed = (Date.now() - startPlayTime) / 1000; // 経過時間（秒）
      const pixelsPerSecond = (bpm / 60) * 100; // BPMに基づいたピクセル/秒
      setCurrentTime(elapsed * pixelsPerSecond);
      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      setStartPlayTime(Date.now() - (currentTime / ((bpm / 60) * 100)) * 1000);
      updatePlayhead();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [isPlaying, bpm]);

  const addTrack = () => {
    const newTrack = {
      id: tracks.length + 1,
      name: `トラック ${tracks.length + 1}`,
      clips: []
    };
    setTracks([...tracks, newTrack]);
  };

  const removeTrack = (trackId) => {
    if (tracks.length > 1) {
      setTracks(tracks.filter(track => track.id !== trackId));
    }
  };

  const handleDrop = async (e, trackId, timePosition) => {
    e.preventDefault();
    try {
      const soundData = JSON.parse(e.dataTransfer.getData('application/json'));
      
      // 拍に合わせて位置を調整
      const beatWidth = 100; // 1拍の幅（px）
      const snappedPosition = Math.round(timePosition / beatWidth) * beatWidth;
      
      // 音声の実際の継続時間を取得
      let duration = 200; // デフォルト値
      if (soundData.audioBlob) {
        try {
          duration = await getAudioDuration(soundData.audioBlob);
        } catch (error) {
          console.warn('音声継続時間の取得に失敗しました:', error);
        }
      }
      
      const newClip = {
        id: Date.now(),
        soundData: soundData,
        startTime: snappedPosition,
        duration: duration,
        trackId: trackId
      };

      setTracks(tracks.map(track => 
        track.id === trackId 
          ? { ...track, clips: [...track.clips, newClip] }
          : track
      ));
    } catch (error) {
      console.error('ドロップエラー:', error);
      setError('音素材の配置に失敗しました。再度お試しください。');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const removeClip = (trackId, clipId) => {
    setTracks(tracks.map(track => 
      track.id === trackId 
        ? { ...track, clips: track.clips.filter(clip => clip.id !== clipId) }
        : track
    ));
  };

  const play = async () => {
    try {
      // AudioContextが中断されている場合は再開
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      setIsPlaying(true);
      
      // 現在の時間位置に基づいて、再生すべきクリップを見つける
      const pixelsPerSecond = (bpm / 60) * 100;
      const currentTimeInSeconds = currentTime / pixelsPerSecond;
      
      // 各トラックのクリップを再生
      const newPlayingAudios = new Map();
      
      tracks.forEach(track => {
        track.clips.forEach(clip => {
          const clipStartTimeInSeconds = clip.startTime / pixelsPerSecond;
          const clipEndTimeInSeconds = clipStartTimeInSeconds + (clip.duration / pixelsPerSecond);
          
          // 現在の時間位置がクリップの範囲内または今後再生される場合
          if (clipEndTimeInSeconds > currentTimeInSeconds) {
            const delay = Math.max(0, clipStartTimeInSeconds - currentTimeInSeconds);
            scheduleClipPlayback(clip, delay * 1000, newPlayingAudios);
          }
        });
      });
      
      setPlayingAudios(newPlayingAudios);
    } catch (error) {
      console.error('再生エラー:', error);
      setError('音声の再生に失敗しました。ブラウザで音声が有効になっているか確認してください。');
    }
  };

  const scheduleClipPlayback = (clip, delayMs, playingAudiosMap) => {
    if (clip.soundData.audioBlob) {
      const audio = new Audio();
      audio.src = URL.createObjectURL(clip.soundData.audioBlob);
      
      const timeoutId = setTimeout(() => {
        audio.play().catch(error => {
          console.error('音声再生エラー:', error);
        });
      }, delayMs);
      
      playingAudiosMap.set(clip.id, { audio, timeoutId });
    }
  };

  const pause = () => {
    setIsPlaying(false);
    
    // 再生中の音声を一時停止
    playingAudios.forEach(({ audio, timeoutId }) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (!audio.paused) {
        audio.pause();
      }
    });
  };

  const stop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    
    // 再生中の音声を停止
    playingAudios.forEach(({ audio, timeoutId }) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      audio.pause();
      audio.currentTime = 0;
    });
    
    setPlayingAudios(new Map());
  };

  return (
    <div className="daw-page">
      <h2>🎹 音楽づくりページ</h2>
      <p>音素材をドラッグ&ドロップして音楽を作りましょう！</p>

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="daw-controls card">
        <div className="transport-controls">
          <button 
            className={`transport-btn play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={isPlaying ? pause : play}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button className="transport-btn stop-btn" onClick={stop}>
            ⏹️
          </button>
        </div>

        <div className="bpm-control">
          <label htmlFor="bpm">🎵 BPM:</label>
          <input
            id="bpm"
            type="number"
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value))}
            min="60"
            max="200"
            className="bpm-input"
          />
        </div>

        <div className="track-controls">
          <button className="button-primary" onClick={addTrack}>
            ➕ トラック追加
          </button>
          <button 
            className="button-secondary" 
            onClick={() => setShowSoundPanel(!showSoundPanel)}
          >
            {showSoundPanel ? '🎵 音素材を隠す' : '🎵 音素材を表示'}
          </button>
        </div>
      </div>

      <div className="daw-main-area">
        {showSoundPanel && (
          <div className="sound-panel">
            <h3>🎵 音素材</h3>
            <div className="sound-list">
              {sounds.length > 0 ? (
                sounds.map(sound => (
                  <SoundItem key={sound.id} sound={sound} />
                ))
              ) : (
                <div className="no-sounds">
                  <p>音素材がありません</p>
                  <p>「音を集める」ページで音を録音してください</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="daw-workspace">
          <div className="track-headers">
            {tracks.map(track => (
              <TrackHeader 
                key={track.id} 
                track={track} 
                onRemove={removeTrack}
                trackHeight={trackHeight}
              />
            ))}
          </div>

          <div className="timeline-container">
            <Timeline bpm={bpm} />
            <div className="tracks-area" ref={timelineRef}>
              <Playhead currentTime={currentTime} />
              {tracks.map(track => (
                <Track
                  key={track.id}
                  track={track}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onRemoveClip={removeClip}
                  trackHeight={trackHeight}
                  bpm={bpm}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="instructions card">
        <h3>📖 使い方</h3>
        <ul>
          <li>音ライブラリから音素材をトラックにドラッグ&ドロップして配置</li>
          <li>音素材は拍に合わせて自動的に配置されます</li>
          <li>▶️ボタンで再生、⏸️ボタンで一時停止、⏹️ボタンで停止</li>
          <li>BPMを変更して音楽の速さを調整</li>
          <li>トラックを追加して複数の音を重ねることができます</li>
        </ul>
      </div>
    </div>
  );
};

const SoundItem = ({ sound }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify(sound));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const playSound = () => {
    if (sound.audioBlob && !isPlaying) {
      const audio = new Audio();
      audio.src = URL.createObjectURL(sound.audioBlob);
      audio.play()
        .then(() => {
          setIsPlaying(true);
          audio.addEventListener('ended', () => {
            setIsPlaying(false);
          });
        })
        .catch(error => {
          console.error('音声再生エラー:', error);
        });
    }
  };

  return (
    <div
      className="sound-item"
      draggable="true"
      onDragStart={handleDragStart}
    >
      <div className="sound-info">
        <h4>{sound.name}</h4>
        <div className="sound-tags">
          {sound.tags.map((tag, index) => (
            <span key={index} className="sound-tag">{tag}</span>
          ))}
        </div>
      </div>
      <div className="sound-actions">
        <button 
          className="play-sound-btn"
          onClick={playSound}
          disabled={isPlaying}
        >
          {isPlaying ? '⏸️' : '▶️'}
        </button>
      </div>
    </div>
  );
};
  return (
    <div className="track-header" style={{ height: trackHeight }}>
      <div className="track-info">
        <h4>{track.name}</h4>
        <div className="track-actions">
          <button 
            className="remove-track-btn"
            onClick={() => onRemove(track.id)}
            title="トラックを削除"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
};

const Timeline = ({ bpm }) => {
  const measures = 16; // 16小節表示
  const beatsPerMeasure = 4; // 4/4拍子
  const beatWidth = 100; // 1拍の幅

  return (
    <div className="timeline">
      {Array.from({ length: measures }, (_, measureIndex) => (
        <div key={measureIndex} className="measure">
          <div className="measure-number">{measureIndex + 1}</div>
          <div className="beats">
            {Array.from({ length: beatsPerMeasure }, (_, beatIndex) => (
              <div 
                key={beatIndex} 
                className="beat"
                style={{ width: beatWidth }}
              >
                {beatIndex + 1}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const Track = ({ track, onDrop, onDragOver, onRemoveClip, trackHeight, bpm }) => {
  const handleDrop = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const timePosition = e.clientX - rect.left;
    onDrop(e, track.id, timePosition);
  };

  return (
    <div 
      className="track"
      style={{ height: trackHeight }}
      onDrop={handleDrop}
      onDragOver={onDragOver}
    >
      <div className="track-grid">
        {/* 拍の境界線を表示 */}
        {Array.from({ length: 64 }, (_, index) => (
          <div key={index} className="beat-line" style={{ left: index * 100 }} />
        ))}
      </div>
      
      {track.clips.map(clip => (
        <AudioClip
          key={clip.id}
          clip={clip}
          onRemove={() => onRemoveClip(track.id, clip.id)}
        />
      ))}
    </div>
  );
};

const AudioClip = ({ clip, onRemove }) => {
  const [waveformData, setWaveformData] = React.useState([]);

  React.useEffect(() => {
    // 簡単な波形データ生成（実際の実装では音声解析が必要）
    const generateWaveform = () => {
      const points = 20; // 波形のポイント数
      const data = [];
      for (let i = 0; i < points; i++) {
        data.push(Math.random() * 0.8 + 0.2); // 0.2-1.0の間のランダム値
      }
      setWaveformData(data);
    };

    generateWaveform();
  }, [clip.soundData]);

  return (
    <div 
      className="audio-clip"
      style={{
        left: clip.startTime,
        width: clip.duration
      }}
    >
      <div className="clip-header">
        <span className="clip-name">{clip.soundData.name}</span>
        <button 
          className="remove-clip-btn"
          onClick={onRemove}
          title="クリップを削除"
        >
          ×
        </button>
      </div>
      <div className="clip-waveform">
        {waveformData.length > 0 ? (
          <svg className="waveform-svg" width="100%" height="30">
            {waveformData.map((height, index) => (
              <rect
                key={index}
                x={`${(index / waveformData.length) * 100}%`}
                y={`${(1 - height) * 15}`}
                width={`${80 / waveformData.length}%`}
                height={`${height * 30}`}
                fill="rgba(255, 255, 255, 0.8)"
              />
            ))}
          </svg>
        ) : (
          <div className="waveform-placeholder">🔊</div>
        )}
      </div>
    </div>
  );
};

const Playhead = ({ currentTime }) => {
  return (
    <div 
      className="playhead"
      style={{ left: currentTime }}
    />
  );
};

export default DAWPage;
