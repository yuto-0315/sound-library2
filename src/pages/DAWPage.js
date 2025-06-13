import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [draggedClip, setDraggedClip] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const timelineRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    // Web Audio API の初期化
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    setAudioContext(ctx);
    
    // LocalStorageから音素材を読み込み
    const savedSounds = JSON.parse(localStorage.getItem('soundRecordings') || '[]');
    
    // audioDataからBlobを復元
    const soundsWithBlob = savedSounds.map(sound => {
      if (sound.audioData) {
        try {
          const byteCharacters = atob(sound.audioData.split(',')[1]);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'audio/wav' });
          return { ...sound, audioBlob: blob };
        } catch (error) {
          console.error('音声データの復元に失敗:', error);
          return sound;
        }
      }
      return sound;
    });
    
    setSounds(soundsWithBlob);
    
    return () => {
      if (ctx) {
        ctx.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // グローバル変数をクリーンアップ
      if (window.currentDraggedSoundBlob) {
        window.currentDraggedSoundBlob = null;
      }
    };
  }, []);

  // 音声ファイルの継続時間を取得
  const getAudioDuration = (audioBlob) => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', () => {
        const duration = audio.duration;
        // 有効な数値かチェック（NaN、Infinity、負の値を除外）
        if (isFinite(duration) && duration > 0) {
          resolve(duration * 100); // 秒からピクセルに変換（1秒=100px）
        } else {
          resolve(200); // 無効な値の場合はデフォルト値
        }
        // URLを解放してメモリリークを防ぐ
        URL.revokeObjectURL(audio.src);
      });
      audio.addEventListener('error', () => {
        resolve(200); // エラーの場合はデフォルト値
        // URLを解放してメモリリークを防ぐ
        URL.revokeObjectURL(audio.src);
      });
      audio.src = URL.createObjectURL(audioBlob);
    });
  };

  // プレイヘッドのアニメーション更新
  const updatePlayhead = useCallback(() => {
    if (isPlaying && startPlayTime) {
      const elapsed = (Date.now() - startPlayTime) / 1000; // 経過時間（秒）
      const pixelsPerSecond = (bpm / 60) * 100; // BPMに基づいたピクセル/秒
      const newCurrentTime = elapsed * pixelsPerSecond;
      
      // 有効な数値かチェック
      if (isFinite(newCurrentTime) && newCurrentTime >= 0) {
        setCurrentTime(newCurrentTime);
      } else {
        console.warn('無効なcurrentTime:', newCurrentTime, 'elapsed:', elapsed, 'pixelsPerSecond:', pixelsPerSecond);
      }
      
      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    }
  }, [isPlaying, startPlayTime, bpm]);

  useEffect(() => {
    if (isPlaying) {
      const pixelsPerSecond = (bpm / 60) * 100;
      // 有効な数値かチェック
      if (isFinite(pixelsPerSecond) && pixelsPerSecond > 0) {
        const timeInSeconds = currentTime / pixelsPerSecond;
        if (isFinite(timeInSeconds) && timeInSeconds >= 0) {
          setStartPlayTime(Date.now() - (timeInSeconds * 1000));
        } else {
          setStartPlayTime(Date.now());
        }
      } else {
        setStartPlayTime(Date.now());
      }
      updatePlayhead();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [isPlaying, bpm, currentTime, updatePlayhead]);

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
    setDragPreview(null);
    
    console.log('ドロップ処理開始:', { trackId, timePosition, draggedClip });
    
    try {
      // 拍に合わせて位置を調整
      const beatWidth = 100; // 1拍の幅（px）
      const snappedPosition = Math.round(timePosition / beatWidth) * beatWidth;
      
      // 既存のクリップの移動かどうかチェック
      if (draggedClip) {
        console.log('既存クリップの移動:', draggedClip.id, '元トラック:', draggedClip.originalTrackId, '新トラック:', trackId);
        
        // 既存クリップの移動
        const updatedClip = {
          ...draggedClip,
          startTime: snappedPosition,
          trackId: trackId
        };

        setTracks(tracks.map(track => {
          if (track.id === draggedClip.originalTrackId && track.id === trackId) {
            // 同じトラック内での移動
            console.log('同じトラック内での移動');
            return {
              ...track,
              clips: track.clips.map(clip => 
                clip.id === draggedClip.id ? updatedClip : clip
              )
            };
          } else if (track.id === draggedClip.originalTrackId) {
            // 元のトラックからクリップを削除
            console.log('元のトラックからクリップを削除');
            return {
              ...track,
              clips: track.clips.filter(clip => clip.id !== draggedClip.id)
            };
          } else if (track.id === trackId) {
            // 新しいトラックにクリップを追加
            console.log('新しいトラックにクリップを追加');
            return {
              ...track,
              clips: [...track.clips, updatedClip]
            };
          }
          return track;
        }));
        setDraggedClip(null);
        return;
      }
      
      // 新しい音素材の配置
      const soundData = JSON.parse(e.dataTransfer.getData('application/json'));
      
      // グローバル変数からaudioBlobを復元
      if (window.currentDraggedSoundBlob) {
        soundData.audioBlob = window.currentDraggedSoundBlob;
        window.currentDraggedSoundBlob = null; // クリーンアップ
      }
      
      console.log('新しい音素材のドロップ:', { soundData, hasAudioBlob: !!soundData.audioBlob });
      
      // 音声の実際の継続時間を取得
      let duration = 200; // デフォルト値
      if (soundData.audioBlob) {
        try {
          duration = await getAudioDuration(soundData.audioBlob);
          console.log('取得したduration:', duration);
        } catch (error) {
          console.warn('音声継続時間の取得に失敗しました:', error);
        }
      }

      // durationが有効な値かチェック
      if (!isFinite(duration) || duration <= 0) {
        console.warn('無効なduration:', duration, 'デフォルト値を使用');
        duration = 200;
      }

      const newClip = {
        id: Date.now(),
        soundData: soundData,
        startTime: snappedPosition,
        duration: duration,
        trackId: trackId
      };

      console.log('作成されたクリップ:', newClip);

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
    
    // ドラッグされているのが既存クリップか新しい音素材かで処理を分ける
    if (draggedClip) {
      e.dataTransfer.dropEffect = 'move';
    } else {
      e.dataTransfer.dropEffect = 'copy';
    }
    
    // ドラッグプレビューの更新
    const rect = e.currentTarget.getBoundingClientRect();
    const timePosition = e.clientX - rect.left;
    const beatWidth = 100;
    const snappedPosition = Math.round(timePosition / beatWidth) * beatWidth;
    
    const trackElement = e.currentTarget;
    const trackRect = trackElement.getBoundingClientRect();
    const tracksAreaRect = timelineRef.current?.getBoundingClientRect();
    
    if (tracksAreaRect) {
      const relativeTop = trackRect.top - tracksAreaRect.top;
      const trackId = parseInt(trackElement.dataset.trackId);
      
      // durationが有効な値かチェック
      const previewWidth = draggedClip && isFinite(draggedClip.duration) && draggedClip.duration > 0 
        ? draggedClip.duration 
        : 200;
      
      setDragPreview({
        left: snappedPosition,
        top: relativeTop + 10,
        width: previewWidth,
        trackId: trackId
      });
    }
  };

  const removeClip = (trackId, clipId) => {
    setTracks(tracks.map(track => 
      track.id === trackId 
        ? { ...track, clips: track.clips.filter(clip => clip.id !== clipId) }
        : track
    ));
  };

  // クリップのドラッグ開始
  const handleClipDragStart = (clip, originalTrackId) => {
    console.log('クリップドラッグ開始:', clip.id, 'トラック:', originalTrackId);
    setDraggedClip({ ...clip, originalTrackId });
  };

  // ドラッグ終了時のクリーンアップ
  const handleDragEnd = (e) => {
    // ドロップが正常に処理されなかった場合、元の状態を保持
    if (draggedClip && e.dataTransfer.dropEffect === 'none') {
      console.log('ドラッグがキャンセルされました。元の位置を保持します。');
    }
    setDraggedClip(null);
    setDragPreview(null);
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
          // clip.durationが有効な値かチェック
          if (!isFinite(clip.duration) || clip.duration <= 0) {
            console.warn('無効なclip.duration:', clip.duration, 'クリップをスキップします');
            return;
          }
          
          const clipStartTimeInSeconds = clip.startTime / pixelsPerSecond;
          const clipEndTimeInSeconds = clipStartTimeInSeconds + (clip.duration / pixelsPerSecond);
          
          // 計算結果が有効かチェック
          if (!isFinite(clipStartTimeInSeconds) || !isFinite(clipEndTimeInSeconds)) {
            console.warn('無効な時間計算:', { clipStartTimeInSeconds, clipEndTimeInSeconds });
            return;
          }
          
          // 現在の時間位置がクリップの範囲内または今後再生される場合
          if (clipEndTimeInSeconds > currentTimeInSeconds) {
            const delay = Math.max(0, clipStartTimeInSeconds - currentTimeInSeconds);
            if (isFinite(delay) && delay >= 0) {
              scheduleClipPlayback(clip, delay * 1000, newPlayingAudios);
            }
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
    console.log('scheduleClipPlayback:', { clip, hasAudioBlob: !!clip.soundData?.audioBlob });
    
    if (clip.soundData && clip.soundData.audioBlob && clip.soundData.audioBlob instanceof Blob) {
      try {
        const audio = new Audio();
        const audioUrl = URL.createObjectURL(clip.soundData.audioBlob);
        audio.src = audioUrl;
        
        const timeoutId = setTimeout(() => {
          audio.play().catch(error => {
            console.error('音声再生エラー:', error);
            URL.revokeObjectURL(audioUrl); // メモリリークを防ぐ
          });
        }, delayMs);
        
        // 音声終了時にURLを解放
        audio.addEventListener('ended', () => {
          URL.revokeObjectURL(audioUrl);
        });
        
        playingAudiosMap.set(clip.id, { audio, timeoutId, audioUrl });
      } catch (error) {
        console.error('createObjectURL エラー:', error, 'audioBlob:', clip.soundData.audioBlob);
      }
    } else {
      console.warn('audioBlobが無効です:', clip.soundData);
    }
  };

  const pause = () => {
    setIsPlaying(false);
    
    // 再生中の音声を一時停止
    playingAudios.forEach(({ audio, timeoutId, audioUrl }) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (!audio.paused) {
        audio.pause();
      }
      // URLを解放
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    });
  };

  const stop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    
    // 再生中の音声を停止
    playingAudios.forEach(({ audio, timeoutId, audioUrl }) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      audio.pause();
      audio.currentTime = 0;
      // URLを解放
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
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
              {dragPreview && (
                <div 
                  className="drag-preview"
                  style={{
                    left: dragPreview.left,
                    top: dragPreview.top,
                    width: dragPreview.width
                  }}
                />
              )}
              {tracks.map(track => (
                <Track
                  key={track.id}
                  track={track}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onRemoveClip={removeClip}
                  onClipDragStart={handleClipDragStart}
                  onDragEnd={handleDragEnd}
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
          <li>左側の音素材パネルから音素材をトラックにドラッグ&ドロップして配置</li>
          <li>配置済みの音素材もドラッグして別の場所に移動できます</li>
          <li>ドラッグ中は配置予定位置に青い影が表示されます</li>
          <li>音素材は拍に合わせて自動的に配置されます</li>
          <li>音素材パネルの▶️ボタンで個別に音を確認できます</li>
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

  const handleDragStart = (e) => {
    // audioBlob以外のデータをJSON文字列として設定
    const soundDataForTransfer = {
      ...sound,
      audioBlob: null // Blobは直接シリアライズできないため一時的にnullに
    };
    
    e.dataTransfer.setData('application/json', JSON.stringify(soundDataForTransfer));
    e.dataTransfer.effectAllowed = 'copy';
    
    // 実際のaudioBlobは別途グローバル変数で保持
    window.currentDraggedSoundBlob = sound.audioBlob;
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

const TrackHeader = ({ track, onRemove, trackHeight }) => {
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

const Track = ({ track, onDrop, onDragOver, onRemoveClip, onClipDragStart, onDragEnd, trackHeight, bpm }) => {
  const handleDrop = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const timePosition = e.clientX - rect.left;
    onDrop(e, track.id, timePosition);
  };

  return (
    <div 
      className="track"
      style={{ height: trackHeight }}
      data-track-id={track.id}
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
          trackId={track.id}
          onRemove={() => onRemoveClip(track.id, clip.id)}
          onDragStart={onClipDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
};

const AudioClip = ({ clip, trackId, onRemove, onDragStart, onDragEnd }) => {
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

  const handleDragStart = (e) => {
    e.stopPropagation(); // イベントバブリングを防ぐ
    
    // ドラッグデータに既存クリップの情報を設定
    e.dataTransfer.setData('text/plain', `existing-clip-${clip.id}`);
    e.dataTransfer.effectAllowed = 'move';
    
    // onDragStartコールバックを呼び出し
    onDragStart(clip, trackId);
  };

  return (
    <div 
      className="audio-clip"
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      style={{
        left: clip.startTime,
        width: isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 200
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
  // currentTimeが有効な数値かチェック
  const safeCurrentTime = isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
  
  return (
    <div 
      className="playhead"
      style={{ left: safeCurrentTime }}
    />
  );
};

export default DAWPage;
