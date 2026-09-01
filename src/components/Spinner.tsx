import {useEffect, useState} from "react";
import {Text} from "ink";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL = 80;

interface SpinnerProps {
    label?: string;
}

export function Spinner({label = "Thinking..."}: SpinnerProps) {
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setFrame((prev) => (prev + 1) % frames.length);
        }, INTERVAL);

        return () => clearInterval(timer);
    }, []);

    return (
        <Text>
            <Text color="cyan">{frames[frame]}</Text>
            {" " + label}
        </Text>
    );
}
