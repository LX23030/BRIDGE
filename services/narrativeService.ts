import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
你是一个讲述两个旅行者故事的旁白：一个是负责引导的向导，另一个是无法行走的同行者。
游戏名为《相依的步伐》（Tethered Steps）。主题包括：隐喻的杜氏肌营养不良（DMD）、脆弱、支持、沉重的负担和爱。
玩家（向导）刚刚帮助同行者穿越了艰难的地形。
请输出一句温馨、绘本风格的中文句子（最多30个字）。
重点描述他们之间的羁绊、旅途的重量或抵达安全地点的如释重负。
`;

export const generateNarrative = async (levelName: string, bridgesBuilt: number): Promise<string> => {
  try {
    const prompt = `旅行者们完成了区域 "${levelName}"。向导搭建了 ${bridgesBuilt} 座桥梁帮助同行者通过。他们的羁绊如何加深了？请用中文回答。`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: 100,
        temperature: 0.8,
      },
    });

    return response.text?.trim() || "无论前路多远，只要携手，便无不可跨越之沟壑。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "手牵手，他们继续前行。";
  }
};