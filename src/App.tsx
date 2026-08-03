import { useState, useCallback, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import SnakeGamePage from './games/snake/SnakeGame';
import TetrisGamePage from './games/tetris/TetrisGame';
import BreakoutGamePage from './games/breakout/BreakoutGame';
import MinesweeperGamePage from './games/minesweeper/MinesweeperGame';
import FlappyGamePage from './games/flappy/FlappyGame';
import Game2048Page from './games/2048/Game2048';

type Screen = { type: 'dashboard' } | { type: 'game'; gameId: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'dashboard' });
  const [transitioning, setTransitioning] = useState(false);

  const handleSelectGame = useCallback((gameId: string) => {
    setTransitioning(true);
    setTimeout(() => {
      setScreen({ type: 'game', gameId });
      setTransitioning(false);
    }, 300);
  }, []);

  const handleBack = useCallback(() => {
    setTransitioning(true);
    setTimeout(() => {
      setScreen({ type: 'dashboard' });
      setTransitioning(false);
    }, 300);
  }, []);

  // Lock body scroll when in a game, let game-scroll-container handle it
  useEffect(() => {
    if (screen.type === 'game') {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, [screen.type]);

  const BG_DARK = 'linear-gradient(135deg, #050510 0%, #0a0a2e 50%, #050510 100%)';

  const renderContent = () => {
    if (screen.type === 'game') {
      const wrap = (child: React.ReactNode) => (
        <div className="game-scroll-container" style={{ background: BG_DARK }}>
          <div className="flex min-h-[100dvh] items-center justify-center p-0 sm:py-4">
            {child}
          </div>
        </div>
      );

      switch (screen.gameId) {
        case 'snake':    return wrap(<SnakeGamePage onBack={handleBack} />);
        case 'tetris':   return wrap(<TetrisGamePage onBack={handleBack} />);
        case 'breakout': return wrap(<BreakoutGamePage onBack={handleBack} />);
        case 'minesweeper': return wrap(<MinesweeperGamePage onBack={handleBack} />);
        case 'flappy':   return wrap(<FlappyGamePage onBack={handleBack} />);
        case '2048':     return wrap(<Game2048Page onBack={handleBack} />);
        default:
          handleBack();
          return null;
      }
    }

    return <Dashboard onSelectGame={handleSelectGame} />;
  };


  return (
    <div
      style={{
        opacity: transitioning ? 0 : 1,
        transform: transitioning ? 'scale(0.98)' : 'scale(1)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}
    >
      {renderContent()}
    </div>
  );
}
