import { Word } from "./word";
export declare class Dictionary {
    private root;
    constructor(root: any);
    /**
     * Save the specified word.
     * @param theDay
     * @param worddata
     */
    createWordOfTheDay(worddata: Word, theDay?: Date): Promise<void>;
    /**
     * Get word of the day.
     * If theDay not specified, today is used.
     * @param theDay
     */
    getWordOfTheDay(theDay?: Date): Promise<Word>;
    /**
     * Look up definition from this dictionary.
     * @param word
     */
    getWord(word: string): Promise<Word>;
    /**
     * Get number of total words this dictionary has saved.
     */
    getWordCount(): Promise<any>;
    private lookupWordInChronological;
    private lookupWord;
}
