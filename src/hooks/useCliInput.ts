import {useState} from "react";
import {useApp, useInput} from "ink";

interface UseCliInputOptions {
    isLoading: boolean;
    onSubmit(text: string): void | Promise<void>;
    onAbort(): boolean;
}

export function useCliInput({
    isLoading,
    onSubmit,
    onAbort
}: UseCliInputOptions) {
    const {exit} = useApp();
    const [value, setValue] = useState("");

    useInput((input, key) => {
        if (key.ctrl && input === "c") {
            if (!onAbort()) {
                exit();
            }
            return;
        }

        if (key.ctrl && input === "d") {
            exit();
            return;
        }

        if (isLoading) {
            return;
        }

        if (key.return) {
            const text = value.trim();

            if (text) {
                setValue("");
                void onSubmit(text);
            }
            return;
        }

        if (key.backspace) {
            setValue((previous) => previous.slice(0, -1));
            return;
        }

        if (input && !key.ctrl && !key.meta) {
            setValue((previous) => previous + input);
        }
    });

    return {value};
}
