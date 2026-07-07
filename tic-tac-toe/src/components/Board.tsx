import Square from "./Square";
import { calculateWinner } from "../utils/utils";

type BoardProps = {
  xIsNext: boolean;
  squares: (string | null)[];
  onPlay: (nextSquares: (string | null)[]) => void;
};

function Board({ xIsNext, squares, onPlay }: BoardProps) {
  const winner = calculateWinner(squares);

  const handleClick = (value: number) => {
    if (squares[value] !== null || winner) return;

    // 與其使用 map 不如使用 slice 更簡潔快速
    const nextSquares = squares.slice();
    const currentValue = xIsNext ? "x" : "o";
    nextSquares[value] = currentValue;
    onPlay(nextSquares);
  };

  return (
    <div className="flex flex-col gap-4">
      {winner ? (
        <p className="text-red-300">Winner is {winner}</p>
      ) : (
        <p className="text-white">Next Player: {xIsNext ? "X" : "O"}</p>
      )}
      <div className="left-site">
        <div className="bg-blue">
          <Square
            value={squares[0] ?? ""}
            onSquareClick={() => {
              handleClick(0);
            }}
          />
          <Square
            value={squares[1] ?? ""}
            onSquareClick={() => {
              handleClick(1);
            }}
          />
          <Square
            value={squares[2] ?? ""}
            onSquareClick={() => {
              handleClick(2);
            }}
          />
        </div>
        <div className="bg-blue">
          <Square
            value={squares[3] ?? ""}
            onSquareClick={() => {
              handleClick(3);
            }}
          />
          <Square
            value={squares[4] ?? ""}
            onSquareClick={() => {
              handleClick(4);
            }}
          />
          <Square
            value={squares[5] ?? ""}
            onSquareClick={() => {
              handleClick(5);
            }}
          />
        </div>
        <div className="bg-blue">
          <Square
            value={squares[6] ?? ""}
            onSquareClick={() => {
              handleClick(6);
            }}
          />
          <Square
            value={squares[7] ?? ""}
            onSquareClick={() => {
              handleClick(7);
            }}
          />
          <Square
            value={squares[8] ?? ""}
            onSquareClick={() => {
              handleClick(8);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default Board;
