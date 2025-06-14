import React, { useState, useRef, useEffect, useCallback } from 'react';
import './DAWPage.css';

// DAWの定数
const BEAT_WIDTH = 100; // 1拍の幅（px）
const BEATS_PER_MEASURE = 4; // 1小節あたりの拍数
const MEASURE_WIDTH = BEAT_WIDTH * BEATS_PER_MEASURE; // 1小節の幅（400px）
const SUB_BEAT_WIDTH = BEAT_WIDTH / 2; // 8分音符の幅（50px）
const TOTAL_MEASURES = 16; // 表示する小節数
const TOTAL_BEATS = TOTAL_MEASURES * BEATS_PER_MEASURE; // 総拍数

const DAWPage = () => {
  // ユニークID生成用のカウンター
  const trackIdCounterRef = useRef(1);
  // トラック名の番号管理用カウンター
  const trackNameCounterRef = useRef(1);
  
  const [tracks, setTracks] = useState(() => [{ 
    id: Date.now(), 
    name: 'トラック 1', 
    clips: [] 
  }]);
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
  const [draggedSoundDuration, setDraggedSoundDuration] = useState(400); // ドラッグ中の音素材の長さ
  const [isExporting, setIsExporting] = useState(false); // 音源出力中フラグ
  const timelineRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    // Web Audio API の初期化
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    setAudioContext(ctx);
    
    // LocalStorageから音素材を読み込み
    const savedSounds = JSON.parse(localStorage.getItem('soundRecordings') || '[]');
    console.log('LocalStorageから読み込んだ音素材数:', savedSounds.length);
    
    // audioDataからBlobを復元
    const soundsWithBlob = savedSounds.map(sound => {
      if (sound.audioData) {
        try {
          console.log('音声データ復元中:', sound.name, 'データサイズ:', sound.audioData.length);
          const byteCharacters = atob(sound.audioData.split(',')[1]);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'audio/wav' });
          console.log('Blob復元成功:', sound.name, 'サイズ:', blob.size, 'タイプ:', blob.type);
          return { ...sound, audioBlob: blob };
        } catch (error) {
          console.error('音声データの復元に失敗:', sound.name, error);
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

  // 音声ファイルの継続時間を取得してピクセル幅に変換
  const getAudioDuration = (audioBlob, currentBpm = bpm) => {
    return new Promise(async (resolve) => {
      if (!audioBlob || !(audioBlob instanceof Blob)) {
        console.log('無効なaudioBlob - デフォルト値を使用');
        resolve(400);
        return;
      }

      console.log('audioBlob詳細:', {
        size: audioBlob.size,
        type: audioBlob.type,
        bpm: currentBpm
      });

      // AudioContextを使用した方法を試す
      if (audioContext) {
        try {
          console.log('AudioContext方式で音声長さを取得中...');
          const arrayBuffer = await audioBlob.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const durationInSeconds = audioBuffer.duration;
          
          console.log('AudioContext方式で取得した長さ:', durationInSeconds, '秒');
          
          if (isFinite(durationInSeconds) && durationInSeconds > 0) {
            const pixelsPerSecond = (currentBpm / 60) * 100;
            const widthInPixels = durationInSeconds * pixelsPerSecond;
            console.log('AudioContext計算結果 - BPM:', currentBpm, '拍/秒:', currentBpm/60, 'ピクセル/秒:', pixelsPerSecond, '最終幅:', widthInPixels, 'px');
            resolve(widthInPixels);
            return;
          }
        } catch (error) {
          console.log('AudioContext方式でエラー、HTML Audio方式にフォールバック:', error);
        }
      }

      // HTML Audio方式（フォールバック）
      const audio = new Audio();
      
      const handleLoadedMetadata = () => {
        const durationInSeconds = audio.duration;
        console.log('HTML Audio方式で取得した長さ:', durationInSeconds, '秒');
        console.log('音声ファイルの詳細情報:', {
          duration: durationInSeconds,
          readyState: audio.readyState,
          networkState: audio.networkState,
          currentTime: audio.currentTime,
          paused: audio.paused,
          ended: audio.ended
        });
        
        // URLをクリーンアップ
        URL.revokeObjectURL(audio.src);
        
        // 有効な数値かチェック（NaN、Infinity、負の値を除外）
        if (isFinite(durationInSeconds) && durationInSeconds > 0) {
          // BPMに基づいてピクセル幅を計算
          // 1拍 = 100px, 1小節 = 4拍 = 400px
          // 1秒あたりの拍数 = BPM / 60
          // 1秒あたりのピクセル数 = (BPM / 60) * 100
          const pixelsPerSecond = (currentBpm / 60) * 100;
          const widthInPixels = durationInSeconds * pixelsPerSecond;
          console.log('HTML Audio計算結果 - BPM:', currentBpm, '拍/秒:', currentBpm/60, 'ピクセル/秒:', pixelsPerSecond, '最終幅:', widthInPixels, 'px');
          resolve(widthInPixels);
        } else {
          // デフォルト値（1小節 = 400px）
          console.log('無効な音声長さのためデフォルト値を使用:', durationInSeconds);
          resolve(400);
        }
      };
      
      const handleError = (event) => {
        console.log('音声ファイルの読み込みエラー - デフォルト値を使用', event);
        console.log('エラー詳細:', {
          error: audio.error,
          networkState: audio.networkState,
          readyState: audio.readyState
        });
        URL.revokeObjectURL(audio.src);
        resolve(400);
      };
      
      const handleCanPlayThrough = () => {
        console.log('canplaythrough イベント発生 - duration:', audio.duration);
      };
      
      // タイムアウト処理を追加（10秒でタイムアウト）
      const timeoutId = setTimeout(() => {
        console.log('音声ファイルの読み込みタイムアウト - デフォルト値を使用');
        console.log('タイムアウト時の状態:', {
          duration: audio.duration,
          readyState: audio.readyState,
          networkState: audio.networkState
        });
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('error', handleError);
        audio.removeEventListener('canplaythrough', handleCanPlayThrough);
        URL.revokeObjectURL(audio.src);
        resolve(400);
      }, 10000);
      
      audio.addEventListener('loadedmetadata', () => {
        console.log('loadedmetadata イベント発生');
        clearTimeout(timeoutId);
        handleLoadedMetadata();
      });
      audio.addEventListener('error', (event) => {
        console.log('error イベント発生');
        clearTimeout(timeoutId);
        handleError(event);
      });
      audio.addEventListener('canplaythrough', handleCanPlayThrough);
      
      try {
        const objectUrl = URL.createObjectURL(audioBlob);
        console.log('ObjectURL作成成功:', objectUrl);
        audio.src = objectUrl;
        
        // 手動でloadを呼び出し
        audio.load();
      } catch (error) {
        console.error('createObjectURL エラー:', error);
        clearTimeout(timeoutId);
        resolve(400);
      }
    });
  };

  // プレイヘッドのアニメーション更新
  const updatePlayhead = useCallback(() => {
    const animate = () => {
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
        
        // 次のフレームを要求
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    
    if (isPlaying && startPlayTime) {
      animate();
    }
  }, [isPlaying, startPlayTime, bpm]);

  useEffect(() => {
    if (isPlaying) {
      if (!startPlayTime) {
        // 再生開始時にstartPlayTimeを設定
        const pixelsPerSecond = (bpm / 60) * 100;
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
      }
    } else {
      // 再生停止時にアニメーションをクリア
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setStartPlayTime(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, bpm, currentTime]);

  // startPlayTimeが設定されたときにアニメーションを開始
  useEffect(() => {
    if (isPlaying && startPlayTime) {
      updatePlayhead();
    }
  }, [isPlaying, startPlayTime, updatePlayhead]);

  // BPM変更時のハンドラー
  const handleBpmChange = async (newBpm) => {
    setBpm(newBpm);
    
    // 既存のクリップのdurationを新しいBPMで再計算
    const updatedTracks = await Promise.all(
      tracks.map(async (track) => {
        const updatedClips = await Promise.all(
          track.clips.map(async (clip) => {
            if (clip.soundData && clip.soundData.audioBlob) {
              try {
                const newDuration = await getAudioDuration(clip.soundData.audioBlob, newBpm);
                return { ...clip, duration: newDuration };
              } catch (error) {
                console.warn('クリップのduration更新に失敗:', error);
                return clip;
              }
            }
            return clip;
          })
        );
        return { ...track, clips: updatedClips };
      })
    );
    
    setTracks(updatedTracks);
  };

  // プロジェクト保存機能
  const saveProject = () => {
    try {
      const projectData = {
        version: '1.0',
        bpm: bpm,
        tracks: tracks,
        sounds: sounds.map(sound => ({
          ...sound,
          audioBlob: null, // Blobは別途保存
          audioData: sound.audioData // base64データを保持
        })),
        timestamp: Date.now(),
        trackNameCounter: trackNameCounterRef.current,
        trackIdCounter: trackIdCounterRef.current
      };

      const projectJson = JSON.stringify(projectData, null, 2);
      const blob = new Blob([projectJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `music-project-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('プロジェクトを保存しました');
    } catch (error) {
      console.error('プロジェクト保存エラー:', error);
      setError('プロジェクトの保存に失敗しました。');
    }
  };

  // プロジェクト読み込み機能
  const loadProject = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const projectData = JSON.parse(e.target.result);
        
        // バージョンチェック
        if (!projectData.version) {
          throw new Error('不正なプロジェクトファイルです');
        }

        // 音声データ復元用のヘルパー関数
        const restoreAudioBlob = (soundData) => {
          if (soundData && soundData.audioData) {
            try {
              const byteCharacters = atob(soundData.audioData.split(',')[1]);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: 'audio/wav' });
              return { ...soundData, audioBlob: blob };
            } catch (error) {
              console.error('音声データの復元に失敗:', soundData.name || 'unknown', error);
              return soundData;
            }
          }
          return soundData;
        };

        // BPMを復元
        setBpm(projectData.bpm || 120);
        
        // トラックを復元（クリップ内の音声データも復元）
        if (projectData.tracks) {
          const restoredTracks = projectData.tracks.map(track => ({
            ...track,
            clips: track.clips.map(clip => ({
              ...clip,
              soundData: restoreAudioBlob(clip.soundData)
            }))
          }));
          setTracks(restoredTracks);
          console.log('トラックデータを復元しました:', restoredTracks.length, 'トラック');
        }
        
        // カウンターを復元
        if (projectData.trackNameCounter) {
          trackNameCounterRef.current = projectData.trackNameCounter;
        }
        if (projectData.trackIdCounter) {
          trackIdCounterRef.current = projectData.trackIdCounter;
        }
        
        // 音素材を復元
        if (projectData.sounds) {
          const restoredSounds = projectData.sounds.map(sound => restoreAudioBlob(sound));
          setSounds(restoredSounds);
          console.log('音素材を復元しました:', restoredSounds.length, '個');
        }
        
        console.log('プロジェクトを読み込みました');
        setError(null);
      } catch (error) {
        console.error('プロジェクト読み込みエラー:', error);
        setError('プロジェクトファイルの読み込みに失敗しました。ファイルが正しいか確認してください。');
      }
    };
    
    reader.readAsText(file);
    // ファイル選択をリセット
    event.target.value = '';
  };

  // 音源出力機能
  const exportAudio = async () => {
    if (!audioContext) {
      setError('AudioContextが初期化されていません。');
      return;
    }

    setIsExporting(true);
    try {
      // 全トラックの全クリップの最大終了時間を計算
      let maxDuration = 0;
      tracks.forEach(track => {
        track.clips.forEach(clip => {
          const pixelsPerSecond = (bpm / 60) * 100;
          const clipStartTimeInSeconds = clip.startTime / pixelsPerSecond;
          const clipDurationInSeconds = clip.duration / pixelsPerSecond;
          const clipEndTime = clipStartTimeInSeconds + clipDurationInSeconds;
          maxDuration = Math.max(maxDuration, clipEndTime);
        });
      });

      if (maxDuration === 0) {
        setError('出力する音声がありません。音素材を配置してください。');
        setIsExporting(false);
        return;
      }

      // 出力用AudioContextを作成（44.1kHz）
      const exportContext = new AudioContext({ sampleRate: 44100 });
      const bufferLength = Math.ceil(maxDuration * exportContext.sampleRate);
      const outputBuffer = exportContext.createBuffer(2, bufferLength, exportContext.sampleRate);
      
      const leftChannel = outputBuffer.getChannelData(0);
      const rightChannel = outputBuffer.getChannelData(1);

      // 各トラックの各クリップを処理
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (clip.soundData && clip.soundData.audioBlob) {
            try {
              const arrayBuffer = await clip.soundData.audioBlob.arrayBuffer();
              const audioBuffer = await exportContext.decodeAudioData(arrayBuffer);
              
              const pixelsPerSecond = (bpm / 60) * 100;
              const startTimeInSamples = Math.floor((clip.startTime / pixelsPerSecond) * exportContext.sampleRate);
              
              // 音声をミックス
              for (let channel = 0; channel < Math.min(audioBuffer.numberOfChannels, 2); channel++) {
                const sourceData = audioBuffer.getChannelData(channel);
                const targetData = channel === 0 ? leftChannel : rightChannel;
                
                for (let i = 0; i < sourceData.length && (startTimeInSamples + i) < targetData.length; i++) {
                  targetData[startTimeInSamples + i] += sourceData[i];
                }
              }
              
              // モノラル音源の場合は両チャンネルにコピー
              if (audioBuffer.numberOfChannels === 1) {
                const sourceData = audioBuffer.getChannelData(0);
                for (let i = 0; i < sourceData.length && (startTimeInSamples + i) < rightChannel.length; i++) {
                  rightChannel[startTimeInSamples + i] += sourceData[i];
                }
              }
            } catch (error) {
              console.error('クリップの処理エラー:', error);
            }
          }
        }
      }

      // WAVファイルとして出力
      const wavBlob = audioBufferToWav(outputBuffer);
      const url = URL.createObjectURL(wavBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `exported-music-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('音源を出力しました');
      await exportContext.close();
    } catch (error) {
      console.error('音源出力エラー:', error);
      setError('音源の出力に失敗しました。');
    } finally {
      setIsExporting(false);
    }
  };

  // AudioBufferをWAVファイルに変換
  const audioBufferToWav = (buffer) => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;
    
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // WAVファイルヘッダー
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // 音声データ
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = buffer.getChannelData(channel)[i];
        const intSample = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  const addTrack = () => {
    // より確実にユニークなIDを生成
    trackIdCounterRef.current += 1;
    const uniqueId = Date.now() + trackIdCounterRef.current;
    
    // トラック名の番号を増加（削除されても番号は戻らない）
    trackNameCounterRef.current += 1;
    const trackName = `トラック ${trackNameCounterRef.current}`;
    
    const newTrack = {
      id: uniqueId,
      name: trackName,
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
      // 8分音符に合わせて位置を調整（50px単位）
      const snappedPosition = Math.round(timePosition / SUB_BEAT_WIDTH) * SUB_BEAT_WIDTH;
      
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
      
      // 音声の実際の継続時間を取得（現在のBPMに基づいて）
      let duration = 400; // デフォルト値（1小節）
      if (soundData.audioBlob) {
        try {
          duration = await getAudioDuration(soundData.audioBlob, bpm);
          console.log('取得したduration:', duration, 'pixels (BPM:', bpm, ')');
        } catch (error) {
          console.warn('音声継続時間の取得に失敗しました:', error);
        }
      }

      // durationが有効な値かチェック
      if (!isFinite(duration) || duration <= 0) {
        console.warn('無効なduration:', duration, 'デフォルト値を使用');
        duration = 400; // 1小節分
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
    const snappedPosition = Math.round(timePosition / SUB_BEAT_WIDTH) * SUB_BEAT_WIDTH;
    
    const trackElement = e.currentTarget;
    const trackRect = trackElement.getBoundingClientRect();
    const tracksAreaRect = timelineRef.current?.getBoundingClientRect();
    
    if (tracksAreaRect) {
      const relativeTop = trackRect.top - tracksAreaRect.top;
      const trackId = parseInt(trackElement.dataset.trackId);
      
      // プレビュー幅を決定
      let previewWidth = 400; // デフォルト値（1小節）
      
      if (draggedClip) {
        // 既存クリップの場合
        previewWidth = isFinite(draggedClip.duration) && draggedClip.duration > 0 
          ? draggedClip.duration 
          : 400;
      } else {
        // 新しい音素材の場合、事前に計算された長さを使用
        previewWidth = draggedSoundDuration;
      }
      
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
    setDraggedSoundDuration(400); // リセット
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
      console.warn('audioBlobが無効です。クリップ情報:', {
        clipId: clip.id,
        soundDataName: clip.soundData?.name,
        hasAudioData: !!clip.soundData?.audioData,
        hasAudioBlob: !!clip.soundData?.audioBlob,
        audioBlobType: typeof clip.soundData?.audioBlob,
        isInstanceOfBlob: clip.soundData?.audioBlob instanceof Blob
      });
      
      // AudioBlobが無効な場合、audioDataから復元を試行
      if (clip.soundData && clip.soundData.audioData && !clip.soundData.audioBlob) {
        console.log('audioDataからBlobを再作成中...');
        try {
          const byteCharacters = atob(clip.soundData.audioData.split(',')[1]);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'audio/wav' });
          
          // クリップのsoundDataを更新
          clip.soundData.audioBlob = blob;
          
          // 再帰的に再試行
          scheduleClipPlayback(clip, delayMs, playingAudiosMap);
          return;
        } catch (restoreError) {
          console.error('audioDataからのBlob復元に失敗:', restoreError);
        }
      }
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
            onChange={(e) => handleBpmChange(parseInt(e.target.value))}
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

        <div className="project-controls">
          <button className="button-secondary" onClick={saveProject}>
            💾 プロジェクト保存
          </button>
          <label className="button-secondary file-input-label">
            📁 プロジェクト読み込み
            <input
              type="file"
              accept=".json"
              onChange={loadProject}
              style={{ display: 'none' }}
            />
          </label>
          <button 
            className="button-primary" 
            onClick={exportAudio}
            disabled={isExporting}
          >
            {isExporting ? '🔄 出力中...' : '🎧 音源出力'}
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
                  <SoundItem 
                    key={sound.id} 
                    sound={sound} 
                    onDragStart={async (sound) => {
                      // ドラッグ開始時に音声の長さを計算
                      if (sound.audioBlob) {
                        try {
                          const duration = await getAudioDuration(sound.audioBlob, bpm);
                          setDraggedSoundDuration(duration);
                        } catch (error) {
                          console.warn('ドラッグ時の音声長さ計算に失敗:', error);
                          setDraggedSoundDuration(400);
                        }
                      } else {
                        setDraggedSoundDuration(400);
                      }
                    }}
                  />
                ))
              ) : (
                <div className="no-sounds">
                  <p>音素材がありません</p>
                  <p>「音あつめ」ページで音を録音してください</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="daw-workspace">
          <div className="track-headers">
            <div className="timeline-header-spacer">
              タイムライン
            </div>
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
            <div className="tracks-area" ref={timelineRef} style={{ minWidth: TOTAL_MEASURES * MEASURE_WIDTH }}>
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
          <li><strong>🖥️ PC:</strong> 左側の音素材パネルから音素材をトラックにドラッグ&ドロップして配置</li>
          <li><strong>📱 スマホ/タブレット:</strong> 音素材を長押ししてからトラックまでドラッグして配置</li>
          <li>配置済みの音素材もドラッグして別の場所に移動できます</li>
          <li>ドラッグ中は配置予定位置に青い影が表示されます</li>
          <li>音素材は8分音符（裏拍含む）に合わせて自動的に配置されます</li>
          <li>音素材パネルの▶️ボタンで個別に音を確認できます</li>
          <li>▶️ボタンで再生、⏸️ボタンで一時停止、⏹️ボタンで停止</li>
          <li>BPMを変更して音楽の速さを調整</li>
          <li>トラックを追加して複数の音を重ねることができます</li>
          <li><strong>💾 プロジェクト保存:</strong> 編集中のデータをJSONファイルとして保存</li>
          <li><strong>📁 プロジェクト読み込み:</strong> 保存したプロジェクトファイルを読み込んで編集を再開</li>
          <li><strong>🎧 音源出力:</strong> 完成した楽曲をWAVファイルとして出力</li>
        </ul>
        <div className="mobile-tips">
          <h4>📱 スマートフォン利用のコツ</h4>
          <ul>
            <li>音素材を軽く長押しするとドラッグモードになります</li>
            <li>ドラッグ中は画面がスクロールしないよう制御されます</li>
            <li>青くハイライトされたトラックで指を離すと音素材が配置されます</li>
            <li>横画面表示にするとより使いやすくなります</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

const SoundItem = ({ sound, onDragStart }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchMove, setTouchMove] = useState(null);

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
    
    // 親コンポーネントのonDragStart関数を呼び出し（音声の長さを計算）
    if (onDragStart) {
      onDragStart(sound);
    }
  };

  // タッチイベント対応
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setIsDragging(false);
    
    // スクロールを一時的に無効化
    document.body.style.overflow = 'hidden';
    
    // 長押し判定用のタイマー
    setTimeout(() => {
      if (touchStart && !isDragging) {
        setIsDragging(true);
        // 親コンポーネントのonDragStart関数を呼び出し
        if (onDragStart) {
          onDragStart(sound);
        }
        // グローバル変数に設定
        window.currentDraggedSoundBlob = sound.audioBlob;
        window.currentDraggedSound = sound;
      }
    }, 200); // 200ms長押しで開始
  };

  const handleTouchMove = (e) => {
    if (!touchStart) return;
    
    const touch = e.touches[0];
    const currentPos = { x: touch.clientX, y: touch.clientY };
    setTouchMove(currentPos);
    
    // ドラッグ開始の判定（10px以上移動）
    const deltaX = Math.abs(currentPos.x - touchStart.x);
    const deltaY = Math.abs(currentPos.y - touchStart.y);
    
    if (!isDragging && (deltaX > 10 || deltaY > 10)) {
      setIsDragging(true);
      // 親コンポーネントのonDragStart関数を呼び出し
      if (onDragStart) {
        onDragStart(sound);
      }
      // グローバル変数に設定
      window.currentDraggedSoundBlob = sound.audioBlob;
      window.currentDraggedSound = sound;
    }
    
    if (isDragging) {
      e.preventDefault(); // スクロールを防止
      
      // ドラッグプレビューの位置を更新
      const dragPreview = document.querySelector('.mobile-drag-preview');
      if (dragPreview) {
        dragPreview.style.left = `${currentPos.x - 50}px`;
        dragPreview.style.top = `${currentPos.y - 20}px`;
      }
      
      // ドロップターゲットのハイライト
      const elementBelow = document.elementFromPoint(currentPos.x, currentPos.y);
      const trackElement = elementBelow?.closest('.track');
      
      // 既存のハイライトを削除
      document.querySelectorAll('.track').forEach(track => {
        track.classList.remove('drag-over');
      });
      
      // 新しいハイライトを追加
      if (trackElement) {
        trackElement.classList.add('drag-over');
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (isDragging && touchMove) {
      // ドロップ処理
      const elementBelow = document.elementFromPoint(touchMove.x, touchMove.y);
      const trackElement = elementBelow?.closest('.track');
      
      if (trackElement) {
        const trackId = parseInt(trackElement.dataset.trackId);
        const rect = trackElement.getBoundingClientRect();
        const timePosition = touchMove.x - rect.left;
        
        // ドロップイベントを発火
        const dropEvent = new CustomEvent('mobileDrop', {
          detail: {
            trackId,
            timePosition,
            sound: sound
          }
        });
        trackElement.dispatchEvent(dropEvent);
      }
    }
    
    // クリーンアップ
    setTouchStart(null);
    setTouchMove(null);
    setIsDragging(false);
    document.body.style.overflow = '';
    
    // ハイライトを削除
    document.querySelectorAll('.track').forEach(track => {
      track.classList.remove('drag-over');
    });
    
    // ドラッグプレビューを削除
    const dragPreview = document.querySelector('.mobile-drag-preview');
    if (dragPreview) {
      dragPreview.remove();
    }
    
    // グローバル変数をクリア
    window.currentDraggedSoundBlob = null;
    window.currentDraggedSound = null;
  };

  const playSound = () => {
    if (sound.audioBlob && !isPlaying && !isDragging) {
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

  // ドラッグプレビューを作成
  const createDragPreview = () => {
    if (isDragging && touchMove) {
      let dragPreview = document.querySelector('.mobile-drag-preview');
      if (!dragPreview) {
        dragPreview = document.createElement('div');
        dragPreview.className = 'mobile-drag-preview';
        dragPreview.textContent = sound.name;
        dragPreview.style.cssText = `
          position: fixed;
          background: rgba(0, 123, 255, 0.8);
          color: white;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 12px;
          pointer-events: none;
          z-index: 1000;
          left: ${touchMove.x - 50}px;
          top: ${touchMove.y - 20}px;
        `;
        document.body.appendChild(dragPreview);
      }
    }
  };

  // ドラッグプレビューの更新
  React.useEffect(() => {
    if (isDragging) {
      createDragPreview();
    }
  }, [isDragging, touchMove]);

  return (
    <div
      className={`sound-item ${isDragging ? 'dragging' : ''}`}
      draggable="true"
      onDragStart={handleDragStart}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
  const measures = TOTAL_MEASURES; // 16小節表示
  const beatsPerMeasure = BEATS_PER_MEASURE; // 4/4拍子

  return (
    <div className="timeline" style={{ minWidth: TOTAL_MEASURES * MEASURE_WIDTH }}>
      {Array.from({ length: measures }, (_, measureIndex) => (
        <div key={measureIndex} className="measure">
          <div className="measure-number">{measureIndex + 1}</div>
          <div className="beats">
            {Array.from({ length: beatsPerMeasure }, (_, beatIndex) => (
              <div 
                key={beatIndex} 
                className="beat"
                style={{ width: BEAT_WIDTH }}
              >
                <div className="beat-main">
                  {beatIndex + 1}
                </div>
                <div className="beat-sub">
                  <div className="sub-beat-marker">・</div>
                </div>
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

  // モバイルドロップイベントの処理
  const handleMobileDrop = (e) => {
    const { trackId, timePosition, sound } = e.detail;
    
    // 模擬的なドロップイベントを作成
    const mockDropEvent = {
      preventDefault: () => {},
      dataTransfer: {
        getData: (type) => {
          if (type === 'application/json') {
            return JSON.stringify(sound);
          }
          return '';
        }
      }
    };
    
    onDrop(mockDropEvent, trackId, timePosition);
  };

  // モバイルクリップ移動イベントの処理
  const handleMobileClipMove = (e) => {
    const { clip, originalTrackId, newTrackId, timePosition } = e.detail;
    
    // 模擬的なドロップイベントを作成
    const mockDropEvent = {
      preventDefault: () => {},
      dataTransfer: {
        getData: (type) => {
          if (type === 'text/plain') {
            return `existing-clip-${clip.id}`;
          }
          return '';
        }
      }
    };
    
    onDrop(mockDropEvent, newTrackId, timePosition);
  };

  React.useEffect(() => {
    const trackElement = document.querySelector(`[data-track-id="${track.id}"]`);
    if (trackElement) {
      trackElement.addEventListener('mobileDrop', handleMobileDrop);
      trackElement.addEventListener('mobileClipMove', handleMobileClipMove);
      return () => {
        trackElement.removeEventListener('mobileDrop', handleMobileDrop);
        trackElement.removeEventListener('mobileClipMove', handleMobileClipMove);
      };
    }
  }, [track.id]);

  return (
    <div 
      className="track"
      style={{ height: trackHeight }}
      data-track-id={track.id}
      onDrop={handleDrop}
      onDragOver={onDragOver}
    >
      <div className="track-grid">
        {/* 表拍（主要な拍）の境界線を表示 */}
        {Array.from({ length: TOTAL_BEATS }, (_, index) => {
          const isFirstBeat = index === 0;
          const isMeasureStart = index % BEATS_PER_MEASURE === 0;
          const className = `beat-line beat-line-main ${isFirstBeat ? 'first-beat' : ''} ${isMeasureStart ? 'measure-start' : ''}`;
          return (
            <div key={`main-${index}`} className={className} style={{ left: index * BEAT_WIDTH }} />
          );
        })}
        {/* 裏拍（8分音符）の境界線を表示 */}
        {Array.from({ length: TOTAL_BEATS }, (_, index) => (
          <div key={`sub-${index}`} className="beat-line beat-line-sub" style={{ left: index * BEAT_WIDTH + SUB_BEAT_WIDTH }} />
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
  const [isDragging, setIsDragging] = React.useState(false);
  const [touchStart, setTouchStart] = React.useState(null);
  const [touchMove, setTouchMove] = React.useState(null);

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

  // タッチイベント対応（クリップの移動）
  const handleTouchStart = (e) => {
    e.stopPropagation();
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setIsDragging(false);
    
    // スクロールを一時的に無効化
    document.body.style.overflow = 'hidden';
  };

  const handleTouchMove = (e) => {
    if (!touchStart) return;
    
    const touch = e.touches[0];
    const currentPos = { x: touch.clientX, y: touch.clientY };
    setTouchMove(currentPos);
    
    // ドラッグ開始の判定（5px以上移動）
    const deltaX = Math.abs(currentPos.x - touchStart.x);
    const deltaY = Math.abs(currentPos.y - touchStart.y);
    
    if (!isDragging && (deltaX > 5 || deltaY > 5)) {
      setIsDragging(true);
      onDragStart(clip, trackId);
    }
    
    if (isDragging) {
      e.preventDefault(); // スクロールを防止
      
      // ドロップターゲットのハイライト
      const elementBelow = document.elementFromPoint(currentPos.x, currentPos.y);
      const trackElement = elementBelow?.closest('.track');
      
      // 既存のハイライトを削除
      document.querySelectorAll('.track').forEach(track => {
        track.classList.remove('drag-over');
      });
      
      // 新しいハイライトを追加（自分のトラック以外も含む）
      if (trackElement) {
        trackElement.classList.add('drag-over');
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (isDragging && touchMove) {
      // ドロップ処理
      const elementBelow = document.elementFromPoint(touchMove.x, touchMove.y);
      const trackElement = elementBelow?.closest('.track');
      
      if (trackElement) {
        const newTrackId = parseInt(trackElement.dataset.trackId);
        const rect = trackElement.getBoundingClientRect();
        const timePosition = touchMove.x - rect.left;
        
        // 既存クリップの移動イベントを発火
        const moveEvent = new CustomEvent('mobileClipMove', {
          detail: {
            clip,
            originalTrackId: trackId,
            newTrackId,
            timePosition
          }
        });
        trackElement.dispatchEvent(moveEvent);
      }
    }
    
    // クリーンアップ
    setTouchStart(null);
    setTouchMove(null);
    setIsDragging(false);
    document.body.style.overflow = '';
    
    // ハイライトを削除
    document.querySelectorAll('.track').forEach(track => {
      track.classList.remove('drag-over');
    });
    
    if (onDragEnd) {
      onDragEnd();
    }
  };

  return (
    <div 
      className={`audio-clip ${isDragging ? 'dragging' : ''}`}
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        left: clip.startTime,
        width: isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 400 // デフォルト1小節
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
