import { HfInference } from '@huggingface/inference';
import dotenv from 'dotenv';

dotenv.config();

const hf = new HfInference();

export async function getAnswer(query) {
    try {
        const response = await hf.textGeneration({
            model: 'facebook/blenderbot-3B',
            inputs: query,
        });
        return response.generated_text;
    } catch (error) {
        console.error("❌ NLP Error:", error);
        return "Sorry, I couldn't process that.";
    }
}