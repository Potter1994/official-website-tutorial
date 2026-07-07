import { useState } from "react";
import Board from "./components/Board";

function App() {
  const [xIsNext, setXIsNext] = useState(true);
  const [history, setHistory] = useState<(string | null)[][]>([
    Array(9).fill(null),
  ]);
  const [currentMove, setCurrentMove] = useState(0);
  const currentSquares = history[currentMove];

  const handlePlay = (nextSquares: (string | null)[]) => {
    const nextHistory = [...history.slice(0, currentMove + 1), nextSquares];
    setHistory(nextHistory);
    setCurrentMove(nextHistory.length - 1);
    setXIsNext((prev) => !prev);
  };

  const jumpTo = (nextMove: number) => {
    setCurrentMove(nextMove);
    setXIsNext(currentMove % 2 === 0);
  };

  const move = history.map((_h, index) => (
    <button
      key={index}
      type="button"
      onClick={() => {
        jumpTo(index);
      }}
    >
      {index === 0 ? "Game Start" : `step: ${index}`}
    </button>
  ));

  return (
    <div className="flex justify-center gap-10">
      <Board onPlay={handlePlay} xIsNext={xIsNext} squares={currentSquares} />
      <div className="rigth-site w-24">
        <h2>Step</h2>
        {move}
      </div>
    </div>
  );
}

export default App;
