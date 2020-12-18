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
     * Get any word.
     * This is implemented by randomly choosing one day in the past,
     * then corresponding word is returned, which was saved on that day.
     */
    getAnyWord(): Promise<Word | null>;
    /**
     * Get number of total words this dictionary has saved.
     */
    getWordCount(): Promise<any>;
    private lookupWordInChronological;
    private lookupWord;
}
