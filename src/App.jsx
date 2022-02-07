import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback
} from "react";
import { Canvas, Node, Label } from "reaflow";
import { motion, useDragControls } from "framer-motion";
import { Portal } from "rdk";
import { useControls, Leva } from "leva";

const BType = {
  block: "block",
  object: "object",
  func: "function",
  str: "string"
};

const Display = {
  [BType.block]: {
    title: "Block"
  },
  [BType.object]: {
    title: "Object"
  },
  [BType.func]: {
    title: "Function"
  }
};

const Draggables = Object.entries(Display).map(
  ([type, { title: displayName }]) => ({ type, displayName })
);

const TYPE_FILED_MAP = {
  [BType.block]: {
    field: BType.str,
    functions: `array<${BType.func}>`
  },
  [BType.object]: {
    field: BType.str,
    functions: `array<${BType.func}>`
  },
  [BType.func]: {
    method: BType.str,
    params: `array<${BType.block}|${BType.func}|${BType.str}>`
  }
};

const TYPE_ROAD_MAD = {
  [BType.block]: {
    edgeable: false,
    parentType: null,
    childrenKeys: ["functions"],
    // key:ChildrenType
    childrenKeyType: { functions: [BType.func] }
  },
  [BType.object]: {
    edgeable: false,
    parentType: [BType.func],
    childrenKeys: ["functions"],
    // key:ChildrenType
    childrenKeyType: { functions: [BType.func] }
  },
  [BType.func]: {
    edgeable: true,
    parentType: [BType.block, BType.func],
    childrenKeys: ["params"],
    // key:ChildrenType
    childrenKeyType: { params: [BType.str, BType.object] }
  }
};

const createRandomId = () =>
  `${Date.now().toString().slice(-6)}^${Math.floor(Math.random() * 100)}`;

const CreateNode = {
  block: () => {
    const id = createRandomId();
    return {
      id,
      text: `${Display.block.title}-${id}`,
      type: BType.block,
      field: "",
      functions: []
    };
  },
  object: (parentId) => {
    const id = createRandomId();
    return {
      id,
      text: `${Display.object.title}-${id}`,
      type: BType.object,
      field: "",
      parent: parentId,
      functions: []
    };
  },
  function: (parentId) => {
    const id = createRandomId();
    return {
      id,
      text: `${Display.function.title}-${id}`,
      type: BType.func,
      parent: parentId,
      method: "",
      params: []
    };
  }
};

// if hasChildren true
//   will return node with dX dY
// if false
//   will return node
const CustomNode = (props) => {
  const { width, height, labels } = props;
  const nodeData = props.properties;
  const hasChildren = TYPE_ROAD_MAD[nodeData.type].childrenKeys.some(
    (key) => Array.isArray(nodeData[key]) && nodeData[key].length > 0
  );
  if (!hasChildren) {
    return <Node {...props} />;
  }
  const labelX = (width / 2 - labels[0].width / 2) * -1 + 16;
  const labelY = (height / 2) * -1 + labels[0].height / 2 + 24;
  return (
    <Node
      {...props}
      label={
        <Label style={{ transform: `translate(${labelX}px, ${labelY}px)` }} />
      }
    />
  );
};

const CustomLeva = ({ title, value, onChange }) => {
  const mountRef = useRef(false);
  const [data, setData] = useControls(title, () => value);
  useEffect(() => {
    setData(value);
    mountRef.current = true;
  }, []);
  useEffect(() => {
    if (!mountRef.current) return;
    const onValueChange = () => {
      if (typeof onChange === "function") {
        console.log("old", value, "new", data);
        onChange(Object.assign({}, data));
      }
    };
    // data and value ?? diff ??
    const oldKeys = Object.keys(data);
    const newKeys = Object.keys(value);
    if (oldKeys.length !== newKeys.length) {
      // update
      onValueChange(data);
      return;
    }
    for (let i = 0; i < oldKeys.length; i++) {
      const key = oldKeys[i];
      if (key !== newKeys[i] && !newKeys.includes(key)) {
        // update
        onValueChange(data);
        return;
      }
      if (data[key] !== value[key]) {
        // update
        onValueChange(data);
        return;
      }
    }
  }, [data]);
  return <Leva titleBar={{ title }} />;
};

export default () => {
  const dragControls = useDragControls();
  const [selections, setSelections] = useState([]);
  const [activeDrag, setActiveDrag] = useState(null);
  // record select node
  const selectNode = useRef(null);
  const setSelectNode = (node) => (selectNode.current = node);
  // user drag node and move it at layout
  const droppableRef = useRef(false);
  const setDroppable = (flag) => (droppableRef.current = flag);
  // drop node record
  const enteredNodeRef = useRef(null);
  const setEnteredNode = (node) => (enteredNodeRef.current = node);
  // group list
  const [groups, setGroups] = useState([CreateNode.block()]);

  // get all nodes by groups
  const getNodes = () => {
    const nodes = [];
    const searchNode = (node) => {
      nodes.push(node);
      const childrenKeys = TYPE_ROAD_MAD[node.type]?.childrenKeys || [];
      childrenKeys.forEach((key) =>
        (Array.isArray(node[key]) ? node[key] : [node[key]]).forEach(
          // depth search
          (clientNode) => searchNode(clientNode)
        )
      );
    };
    groups.forEach((n) => searchNode(n));
    return nodes;
  };
  // get all edges by groups
  const getEdges = () => {
    const edges = [];
    const searchEdges = (node) => {
      node = node || {};
      const { type, id: parentId } = node;
      const childrenKeys = TYPE_ROAD_MAD[type]?.childrenKeys || [];
      // node => childrens
      for (const key of childrenKeys) {
        if (!Array.isArray(node[key])) {
          continue;
        }
        const childrens = node[key];
        if (childrens.some((d) => typeof d === BType.str)) {
          continue;
        }
        for (let i = 0; i < childrens.length - 1; i++) {
          const node = childrens[i];
          const next = childrens[i + 1];
          if (
            !TYPE_ROAD_MAD[node.type].edgeable ||
            !TYPE_ROAD_MAD[next.type].edgeable
          ) {
            continue;
          }
          edges.push({
            id: `${node.id}-${next.id}`,
            from: node.id,
            to: next.id,
            parent: parentId
          });
        }
        // node => childrens => deepth search
        childrens.forEach((node) => searchEdges(node));
      }
    };
    groups.forEach((g) => searchEdges(g));
    return edges;
  };

  const onRemoveNode = (_, node) => {
    if (!node.parent) {
      const filterGroups = groups.filter((g) => g.id !== node.id);
      if (filterGroups.length !== groups.length) {
        setGroups(filterGroups);
        return;
      }
    }
    const targetId = node.id;
    if (node.parent) {
      let newGroups = groups;
      const searchNode = (g) => {
        const childrenKeys = TYPE_ROAD_MAD[g.type]?.childrenKeys || [];
        // keys => for
        for (let i = 0; i < childrenKeys.length; i++) {
          const key = childrenKeys[i];
          const children = g[key];
          if (!Array.isArray(children)) {
            throw Error("why no array");
          }
          // key => params => for
          for (let j = 0; j < children.length; j++) {
            const n = children[j];
            if (n.id === targetId) {
              // remove
              children.splice(j, 1);
              setGroups([...newGroups]);
              return true;
            }
            // deepth search
            if (searchNode(n)) {
              return true;
            }
          }
        }
        return false;
      };
      for (const g of newGroups) {
        searchNode(g);
      }
    }
  };
  const onClickNode = (_, node) => {
    // insert data leva
    setSelectNode(node);
    // selected
    setSelections([node.id]);
  };
  const onClickCanvas = () => {
    // clear null
    setSelectNode(null);
    setSelections([]);
  };

  const onDragStart = (event, data) => {
    setActiveDrag(data);
    dragControls.start(event, { snapToCursor: true });
  };

  const onDragEnd = (event) => {
    const parentNode = enteredNodeRef.current;
    const droppable = droppableRef.current;
    const activeDragType = activeDrag;
    let flag = false;
    // insert children node
    if (droppable && parentNode && CreateNode[activeDragType]) {
      const childrenKeyType = TYPE_ROAD_MAD[parentNode.type].childrenKeyType;
      for (const [parentKey, childrenTypes] of Object.entries(
        childrenKeyType
      )) {
        if (childrenTypes.includes(activeDragType)) {
          // create func node
          const newChildredNode = CreateNode[activeDragType](parentNode.id);
          parentNode[parentKey].push(newChildredNode);
          setGroups((groups) => [...groups]);
          flag = true;
          break;
        }
      }
      if (!flag) {
        console.log(
          "parentNode childrenType:",
          childrenKeyType,
          "but no include",
          activeDragType
        );
      }
    }
    // insert single node
    if (
      droppable &&
      !parentNode &&
      TYPE_ROAD_MAD[activeDragType].parentType === null &&
      CreateNode[activeDragType]
    ) {
      // create block node
      const newSingleNode = CreateNode[activeDragType]();
      setGroups((groups) => [...groups, newSingleNode]);
      flag = true;
    }

    if (!parentNode && !flag) {
      // if node no add
      console.log(
        "dragNodeType:",
        activeDragType,
        "but no support layout:",
        TYPE_ROAD_MAD[activeDragType].parentType === null
      );
    }

    setDroppable(false);
    setActiveDrag(null);
    setEnteredNode(null);
  };

  useEffect(() => {
    setGroups((gs) => [...gs]);
  }, []);

  const onLevaChange = useCallback((data) => {
    const node = selectNode.current;
    const typeMap = TYPE_FILED_MAP[node.type];
    const keys = Object.keys(typeMap);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const type = typeMap[key];
      // key = single string
      if (type === BType.str) {
        node[key] = String(data[key]);
        continue;
      }
      // key = array string
      if (type.replace(/array<(.+)>/, "$1").includes(BType.str)) {
        // filter valid key for merge array
        const keys = Object.keys(data).filter(
          (k) => k.includes(key) && data[k] !== "" && data[k] !== undefined
        );
        // node[key] = [....]
        for (const k of keys) {
          node[key][parseInt(k.replace(key, ""))] = data[k];
        }
        continue;
      }
    }
    console.log("onLevaChange", node);
  }, []);

  const leavaValue = useMemo(() => {
    if (!selectNode.current) return;
    const node = selectNode.current;
    const typeMap = TYPE_FILED_MAP[node.type];
    let nodeData = {};
    const keys = Object.keys(typeMap);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const type = typeMap[key];
      // key = single string
      if (type === BType.str) {
        // nodeData.field = node.field;
        console.log("set field", node.field, node["field"], node, nodeData);
        nodeData[key] = node[key];
        continue;
      }
      // key = array string
      if (type.replace(/array<(.+)>/, "$1").includes(BType.str)) {
        // can edit
        if (
          Array.isArray(node[key]) &&
          (node[key].length === 0 ||
            node[key].every((val) => typeof val === BType.str))
        ) {
          const params = node[key];
          for (let i = 0; i < params.length; i++) {
            const p = params[i];
            nodeData[`${key}${i}`] = p;
          }
          // new item empty string
          nodeData[`${key}${params.length}`] = "";
        }
        continue;
      }
    }
    console.log("initValue", nodeData);
    return {
      title: node.text,
      value: nodeData
    };
  }, [selections]);

  return (
    <div className="container">
      <style>
        {`.container {
            position: "absolute", top: 0, bottom: 0, left: 0, right: 0
          }
          .float-panel {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            background: #272626;
            color: white;
            padding: 16px 8px;
            display: flex;
            flex-direction: column;
          }
          .main-panel {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            right: 0;
            background-color: #0d0e17;
            background-image: -webkit-repeating-radial-gradient(top center, rgba(255,255,255,.1), rgba(255,255,255,.1) 1px, transparent 0, transparent 100%);
            background-size: 20px 20px;
          }
          .block {
            height: 48px;
            width: 48px;
            border-radius: 4px;
            border: solid 1px #00c5be;
            cursor: grab;
            background: black;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px;
            margin: 8px;
            font-size: 12px;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            -khtml-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
          }
          .dragger {
            height: 48px;
            width: 48px;
            z-index: 999;
            pointer-events: none;
            user-select: none;
            cursor: grabbing;
          }
          .dragInner {
            height: 48px;
            width: 48px;
            font-size: 12px;
            pointer-events: none;
            border-radius: 4px;
            background: black;
            border: solid 1px #00c5be;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
          }`}
      </style>
      <div className="main-panel">
        <Canvas
          nodes={getNodes()}
          edges={getEdges()}
          selections={selections}
          node={
            <CustomNode
              onEnter={(event, node) => setEnteredNode(node)}
              onLeave={(event, node) => setEnteredNode(null)}
              onClick={onClickNode}
              onRemove={onRemoveNode}
            />
          }
          onCanvasClick={onClickCanvas}
          onMouseEnter={() => setDroppable(true)}
          onMouseLeave={() => setDroppable(false)}
        />
      </div>
      <div className="float-panel">
        {Draggables.map(({ displayName, type }) => (
          <motion.div
            key={type}
            className="block"
            onMouseDown={(event) => onDragStart(event, type)}
          >
            {displayName}
          </motion.div>
        ))}
      </div>
      <Portal>
        <motion.div
          drag
          dragControls={dragControls}
          className="dragger"
          onDragEnd={onDragEnd}
        >
          {activeDrag && (
            <div className="dragInner">{Display[activeDrag].title}</div>
          )}
        </motion.div>
      </Portal>
      {!!selections.length &&
        selections.map((key) => (
          <CustomLeva {...leavaValue} key={key} onChange={onLevaChange} />
        ))}
    </div>
  );
};

