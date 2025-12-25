export function updateBalance(balance) {  
  let sompi = 0;
  if (Array.isArray(balance) && balance.length > 0) {
    // Try both 'Mature' and 'mature' keys
    sompi = Number(balance[0].Mature ?? balance[0].mature ?? 0);
  } else if (typeof balance === 'object' && balance !== null) {
    // Try both 'Mature' and 'mature' keys
    sompi = Number(balance.Mature ?? balance.mature ?? 0);
  } else {
    sompi = Number(balance) || 0;
  }
  const kasBalance = sompi / 1e8;
  const formatted = isNaN(kasBalance) ? '0' : kasBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 });
  document.getElementById('balance').textContent = formatted + ' KAS';
}

export function updateReceiveAddress(address) {
  document.getElementById('receiveAddress').textContent = address;
}
