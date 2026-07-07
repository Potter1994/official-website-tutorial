function Square({
  value,
  onSquareClick,
}: {
  value: string;
  onSquareClick: () => void;
}) {
  return (
    <button
      onClick={onSquareClick}
      className="w-8 h-8 bg-white align-bottom border text-2xl text-blue-500 border-slate-500"
    >
      {value}
    </button>
  );
}

export default Square;
