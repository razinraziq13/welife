import type { GameView } from '@engine/view';

export function portfolioSaleValue({ markets, bonds }: GameView['enterprise']['investments']) {
  return (
    markets.reduce((total, market) => total + market.balanceMinor, 0n) +
    bonds.reduce((total, bond) => total + bond.saleValueMinor, 0n)
  );
}
