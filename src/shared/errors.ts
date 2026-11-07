import type { FitaError } from './types';

const USE_LOGIN = 'Se a sua conta tem acesso, ative “Usar login do navegador” em Ajustes e tente de novo.';

const RULES: { pattern: RegExp; code: string; title: string; hint: string }[] = [
  { pattern: /Unsupported URL|not a valid URL|No video could be found/i, code: 'invalid-link', title: 'Este link não leva a um vídeo', hint: 'Abra o vídeo no navegador e copie o endereço da página dele.' },
  { pattern: /private video|video is private|account is private/i, code: 'private', title: 'Este vídeo é privado', hint: USE_LOGIN },
  { pattern: /members[- ]only|join this channel|premium/i, code: 'members', title: 'Este vídeo é só para assinantes', hint: USE_LOGIN },
  { pattern: /could not (copy|find).*cookie|failed to decrypt|cookie database|DPAPI/i, code: 'cookies', title: 'O login do navegador não pôde ser lido', hint: 'Feche o navegador e tente de novo. Chrome e Edge costumam bloquear essa leitura; no Firefox ela funciona melhor.' },
  { pattern: /confirm your age|age[- ]restricted|inappropriate for some users/i, code: 'age', title: 'Este vídeo tem restrição de idade', hint: USE_LOGIN },
  { pattern: /sign in to confirm|not a bot/i, code: 'bot', title: 'O site pediu para confirmar que você não é um robô', hint: 'Ative “Usar login do navegador” em Ajustes e tente de novo.' },
  { pattern: /login required|log in|sign in|logged[- ]in|authentication|rate-limit reached|cookies/i, code: 'login', title: 'O site exige login para mostrar este vídeo', hint: 'Ative “Usar login do navegador” em Ajustes e tente de novo.' },
  { pattern: /available in your (country|location|region)|geo.?restrict|blocked it in your/i, code: 'geo', title: 'Este vídeo está bloqueado no seu país', hint: 'O bloqueio é do site e não pode ser ajustado aqui.' },
  { pattern: /IP address is blocked|blocked from accessing/i, code: 'ip-block', title: 'O site bloqueou o acesso a partir da sua rede', hint: 'Ative “Usar login do navegador” em Ajustes ou tente de novo em outra rede.' },
  { pattern: /HTTP Error 429|too many requests/i, code: 'rate', title: 'O site limitou as requisições', hint: 'Espere alguns minutos e tente de novo.' },
  { pattern: /Requested format is not available/i, code: 'format-gone', title: 'Esta opção não está mais disponível', hint: 'Cole o link de novo para ver as opções atuais.' },
  { pattern: /No space left|not enough space|Errno 28|WinError 112/i, code: 'disk', title: 'O disco está sem espaço', hint: 'Libere espaço ou escolha outra pasta em Ajustes.' },
  { pattern: /Permission denied|Errno 13|WinError 5\b/i, code: 'permission', title: 'A pasta de destino não permite gravar', hint: 'Escolha outra pasta em Ajustes.' },
  { pattern: /ffmpeg.*not (found|installed)|ffprobe.*not found/i, code: 'ffmpeg', title: 'O ffmpeg não está instalado', hint: 'Instale o ffmpeg em Ajustes. Ele junta o vídeo e o áudio.' },
  { pattern: /getaddrinfo|Name or service not known|No address associated|Failed to resolve|Network is unreachable|WinError 1005[01]|WinError 1006[01]|Temporary failure in name|Unable to connect|connection (refused|reset)|timed out/i, code: 'network', title: 'O site não respondeu', hint: 'Verifique a sua internet e tente de novo.' },
  { pattern: /removed|deleted|no longer available|does not exist|HTTP Error 404|HTTP Error 410|Video unavailable|video is unavailable/i, code: 'gone', title: 'Este vídeo foi removido ou não existe', hint: 'Confira o link no navegador.' },
  { pattern: /Unable to extract|Unable to download (webpage|API|JSON)|Failed to parse|Cannot parse data|nsig|HTTP Error 403/i, code: 'extractor', title: 'O yt-dlp não conseguiu ler este vídeo', hint: 'O site pode ter mudado. Atualize o yt-dlp em Ajustes e tente de novo.' },
];

export function classifyError(stderr: string): FitaError {
  const detail = stderr.trim().slice(-2000);
  const errorLines = detail.split(/\r?\n/).filter((line) => line.startsWith('ERROR')).join('\n') || detail;
  const rule = RULES.find(({ pattern }) => pattern.test(errorLines));
  if (rule) return { code: rule.code, title: rule.title, hint: rule.hint, detail };
  return { code: 'unknown', title: 'Este vídeo não pôde ser processado', hint: 'Atualize o yt-dlp em Ajustes e tente de novo. Os detalhes técnicos estão abaixo.', detail };
}

export const ERRORS = {
  invalidLink: (): FitaError => ({ code: 'invalid-link', title: 'Isto não é um link', hint: 'Cole um endereço que comece com https://' }),
  emptyClipboard: (): FitaError => ({ code: 'empty-clipboard', title: 'Não há um link na área de transferência', hint: 'Copie o endereço do vídeo e clique em Colar de novo.' }),
  offline: (): FitaError => ({ code: 'network', title: 'Sem conexão com a internet', hint: 'Verifique a sua conexão e tente de novo.' }),
  noTool: (): FitaError => ({ code: 'no-ytdlp', title: 'O yt-dlp não está instalado', hint: 'Instale em Ajustes. Leva menos de um minuto.' }),
  noFfmpeg: (): FitaError => ({ code: 'ffmpeg', title: 'O ffmpeg não está instalado', hint: 'Instale o ffmpeg em Ajustes. Ele junta o vídeo e o áudio.' }),
  live: (): FitaError => ({ code: 'live', title: 'Esta transmissão ainda está ao vivo', hint: 'Tente de novo quando ela terminar.' }),
  noFormats: (): FitaError => ({ code: 'no-formats', title: 'Este link não tem vídeo para baixar', hint: 'Pode ser só uma foto ou um conteúdo protegido contra cópia.' }),
  timeout: (): FitaError => ({ code: 'timeout', title: 'O site demorou demais para responder', hint: 'Tente de novo em instantes.' }),
};
