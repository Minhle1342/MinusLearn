import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chatWithNPC,
  GEMINI_DEFAULT_MODEL,
  generateSpeakingScenario,
} from './api';


function geminiResponse(payload) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
  };
}


describe('Gemini speaking role-play', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('grounds Mino opening in the selected topic and vocabulary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse({
      situation: 'Mino đang giúp bạn lên lịch trình.',
      npc_name: 'Mino',
      npc_first_line: 'Which destination should we add to the itinerary?',
      npc_first_emotion: 'happy',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await generateSpeakingScenario(
      [{ word: 'itinerary', meaning: 'lịch trình' }, { word: 'destination', meaning: 'điểm đến' }],
      'Travel',
      'test-key',
      GEMINI_DEFAULT_MODEL,
    );

    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    const prompt = body.contents[0].parts[0].text;
    expect(url).toContain(`/models/${GEMINI_DEFAULT_MODEL}:generateContent`);
    expect(prompt).toContain('selected topic: "Travel"');
    expect(prompt).toContain('itinerary (lịch trình)');
    expect(prompt).toContain('Mino is the only NPC');
    expect(prompt).toContain('at least one supplied vocabulary word');
  });

  it('keeps later Gemini turns in Mino role and the same vocabulary context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse({
      text: 'That itinerary sounds exciting. Which destination comes first?',
      emotion: 'excited',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithNPC(
      'Mino: Where should we travel?\nYou: I want to visit Tokyo.',
      'test-key',
      GEMINI_DEFAULT_MODEL,
      { topicName: 'Travel', vocabulary: ['itinerary', 'destination'] },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const instruction = body.systemInstruction.parts[0].text;
    expect(instruction).toContain('You are Mino');
    expect(instruction).toContain('role-play about "Travel"');
    expect(instruction).toContain('itinerary, destination');
    expect(body.contents[0].parts[0].text).toContain('You: I want to visit Tokyo.');
  });
});
