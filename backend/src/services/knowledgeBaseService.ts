import fs from 'fs';
import path from 'path';

/**
 * Get relevant content from the knowledge base based on task ID and user response
 */
export async function getRelevantKBContent(taskId: string, userResponse: string): Promise<string> {
  try {
    // Read all .md files from the kb folder
    const kbDir = path.join(__dirname, '../../data/kb');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(kbDir)) {
      console.warn('[WARNING] Knowledge base directory not found. Creating...');
      fs.mkdirSync(kbDir, { recursive: true });
      return '';
    }

    const files = fs.readdirSync(kbDir).filter(f => f.endsWith('.md'));
    
    if (files.length === 0) {
      console.warn('[WARNING] No markdown files found in knowledge base.');
      return '';
    }

    // For simplicity, combine all .md text
    let allContent = '';
    for (let file of files) {
      try {
        const filePath = path.join(kbDir, file);
        allContent += fs.readFileSync(filePath, 'utf8');
        allContent += '\n\n';
      } catch (error) {
        console.error(`[ERROR] Failed to read file ${file}:`, error);
        // Continue with other files
        continue;
      }
    }

    // Basic approach: If certain keywords appear, return relevant excerpt
    // In a real implementation, you would want to use more sophisticated text matching or embeddings
    const keywords = userResponse.toLowerCase().split(' ');
    const paragraphs = allContent.split('\n\n');
    
    const relevantParagraphs = paragraphs.filter(para => 
      keywords.some(keyword => 
        para.toLowerCase().includes(keyword) && keyword.length > 3
      )
    );

    if (relevantParagraphs.length > 0) {
      // Return up to 2 most relevant paragraphs
      return relevantParagraphs.slice(0, 2).join('\n\n');
    }

    // If no relevant content found, return a small portion of the content
    return allContent.substring(0, 300);

  } catch (error) {
    console.error('[ERROR] Failed to get knowledge base content:', error);
    return '';
  }
} 