const winRule = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const calculateWinner = (squares: (string | null)[]) => {
  for (let i = 0; i < winRule.length; i++) {
    const line = winRule[i];
    const state = squares[line[0]];
    const result = line.every((num) => state === squares[num]);
    if (result) {
      return state;
    }
  }
  return null;
};
