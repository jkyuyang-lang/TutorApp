"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const GRADE_OPTIONS = [
  "Pre-K",
  "Kindergarten",
  "1st grade",
  "2nd grade",
  "3rd grade",
  "4th grade",
  "5th grade",
  "6th grade",
  "7th grade",
  "8th grade",
  "9th grade",
  "10th grade",
  "11th grade",
  "12th grade",
  "College Freshman",
  "College Sophomore",
  "College Junior",
  "College Senior",
  "Graduate student",
  "Adult learner",
];

interface GradeLevelSelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function GradeLevelSelect({ value, onChange, id }: GradeLevelSelectProps) {
  const isPresetValue = value === "" || GRADE_OPTIONS.includes(value);
  const [otherMode, setOtherMode] = useState(!isPresetValue && value !== "");
  const [customValue, setCustomValue] = useState(!isPresetValue ? value : "");

  const selectValue = otherMode ? "__other__" : value;

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(val) => {
          if (val === "__other__") {
            setOtherMode(true);
            setCustomValue("");
            onChange("");
          } else {
            setOtherMode(false);
            setCustomValue("");
            onChange(val ?? "");
          }
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select grade level" />
        </SelectTrigger>
        <SelectContent>
          {GRADE_OPTIONS.map((grade) => (
            <SelectItem key={grade} value={grade}>
              {grade}
            </SelectItem>
          ))}
          <SelectItem value="__other__">Other</SelectItem>
        </SelectContent>
      </Select>
      {otherMode && (
        <Input
          value={customValue}
          onChange={(e) => {
            setCustomValue(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="Enter grade level"
          autoFocus
        />
      )}
    </div>
  );
}
