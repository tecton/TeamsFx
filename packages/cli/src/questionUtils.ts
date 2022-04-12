// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  QTreeNode,
  Inputs,
  Platform,
  StaticOptions,
  Question,
  validate,
  OptionItem,
} from "@microsoft/teamsfx-api";

export async function filterQTreeNode(
  root: QTreeNode,
  key: string,
  value: any
): Promise<QTreeNode | undefined> {
  /// finds the searched node
  let searchedNode: QTreeNode | undefined = undefined;
  const parentMap = new Map<QTreeNode, QTreeNode>();
  const stack = [root];
  while (stack.length > 0) {
    const currentNode = stack.pop();
    if (currentNode?.data.name === key) {
      searchedNode = currentNode;
      break;
    }
    if (currentNode?.children) {
      currentNode.children.forEach((node) => {
        parentMap.set(node, currentNode);
        stack.push(node);
      });
    }
  }
  if (!searchedNode || searchedNode.data.type === "group") return undefined;

  /// checks the answer is valid
  const searchedNodeAns = await calculateByGivenAns(searchedNode.data, value);
  if (searchedNodeAns === undefined) return undefined;
  searchedNode.data.value = searchedNodeAns;

  /// gets its ancestors and calculate their answers
  const ancestorsWithAns: QTreeNode[] = [searchedNode];
  let currentNode = searchedNode;
  while (parentMap.has(currentNode)) {
    /// TODO: add later
    throw Error("Not implemented");
  }
  const inputs: Inputs = { platform: Platform.CLI_HELP };
  ancestorsWithAns.forEach((node) => {
    if (node.data.type !== "group" && node.data.name && node.data.value)
      inputs[node.data.name] = node.data.value;
  });

  /// gets the children which conditions match the parent's answer
  const matchedChildren: QTreeNode[] = [];
  if (searchedNode.children) {
    for (const child of searchedNode.children) {
      if (child && child.condition) {
        const validRes = await validate(child.condition, searchedNodeAns, inputs);
        if (validRes === undefined) {
          matchedChildren.push(child);
        }
      }
    }
  }

  /// generates a new tree
  const newRoot = Object.assign({}, ancestorsWithAns.pop()!);
  currentNode = newRoot;
  while (ancestorsWithAns.length > 0) {
    const nextNode = ancestorsWithAns.pop()!;
    currentNode.children = [nextNode];
    currentNode = nextNode;
  }
  currentNode.children = matchedChildren.map((child) => Object.assign({}, child));
  return newRoot;
}

async function calculateByGivenAns(ques: Question, ans: any, caseSensitive = false) {
  switch (ques.type) {
    case "multiSelect":
      if (!Array.isArray(ans)) return undefined;
      let matchedOptions = ans
        .map((s) => getMatchedOption(ques.staticOptions, s, caseSensitive))
        .filter((op) => op) as StaticOptions;
      let matchedIds = matchedOptions.map((op) => getOptionId(op, !caseSensitive));
      if (ques.onDidChangeSelection) {
        /// run onDidChangeSelection for changing the answer
        matchedIds = Array.from(
          await ques.onDidChangeSelection(new Set<string>(matchedIds), new Set<string>())
        );
        matchedOptions = matchedIds
          .map((s) => getMatchedOption(ques.staticOptions, s, caseSensitive))
          .filter((op) => !op) as StaticOptions;
      }
      return ques.returnObject ? matchedOptions : matchedIds;
    case "singleSelect":
      if (typeof ans !== "string") return undefined;
      const matchedOption = getMatchedOption(ques.staticOptions, ans, caseSensitive);
      return ques.returnObject || !matchedOption ? matchedOption : getOptionId(matchedOption);
    case "text":
      return ans;
    default:
      throw Error("Not supported question's type");
  }
}

function getMatchedOption(options: StaticOptions, value: string, caseSensitive = false) {
  const newValue = caseSensitive ? value : value.toLocaleLowerCase();
  const ids = options.map((op) => getOptionId(op, !caseSensitive));
  const cliNames = options.map((op) => getOptionCliName(op, !caseSensitive));
  const index = ids.includes(newValue)
    ? ids.findIndex((id) => id === newValue)
    : cliNames.findIndex((name) => name === newValue);
  if (index > -1) {
    return options[index];
  }
  return undefined;
}

function getOptionId(option: string | OptionItem, toLocaleLowerCase = true) {
  const id = typeof option === "string" ? option : option.id;
  return toLocaleLowerCase ? id.toLocaleLowerCase() : id;
}

function getOptionCliName(option: string | OptionItem, toLocaleLowerCase = true) {
  const cliName = typeof option === "string" ? option : option.cliName;
  return toLocaleLowerCase ? cliName?.toLocaleLowerCase() : cliName;
}
