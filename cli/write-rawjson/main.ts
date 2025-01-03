import { args, exec, execAsync, cmd, cmdAsync, start, startCmd, copyDirectory, setLoggerPath } from "../.tsc/context";
import { Environment } from "../.tsc/System/Environment";
import { Directory } from "../.tsc/System/IO/Directory";
import { Path } from "../.tsc/System/IO/Path";
import { File } from "../.tsc/System/IO/File";
import { UTF8Encoding } from "../.tsc/System/Text/UTF8Encoding";
import { Server } from "../.tsc/Cangjie/TypeSharp/System/Server";
import { Json } from "../.tsc/TidyHPC/LiteJson/Json";
import { RawJson, WebMessage } from "../IRawJson";
import { apis } from "../.tsc/Cangjie/TypeSharp/System/apis";
import { GetCadVersionInput, GetCadVersionOutput } from "../GetCadVersion";

let parameters = {} as { [key: string]: string };
let utf8 = new UTF8Encoding(false);
for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    if (arg.startsWith("--")) {
        let key = arg.substring(2);
        let value = args[i + 1];
        parameters[key] = value;
        i++;
    }
    else if (arg.startsWith("-")) {
        let key = arg.substring(1);
        let value = args[i + 1];
        parameters[key] = value;
        i++;
    }
}
console.log(parameters);

let inputPath = parameters.i ?? parameters.input;
let outputPath = parameters.o ?? parameters.output;
let loggerPath = parameters.l ?? parameters.logger;
if (loggerPath != undefined && loggerPath.length != 0) {
    setLoggerPath(loggerPath);
}

let getCadVersion = async (input: GetCadVersionInput) => {
    let pluginName = "GetCadVersion";
    let response = await apis.runAsync("run", {
        PluginName: pluginName,
        Input: input
    });
    if (response.StatusCode == 200) {
        let msg = response.Body as WebMessage;
        if (msg.success) {
            return msg.data.Output as GetCadVersionOutput;
        }
        else {
            throw msg.message;
        }
    }
    else {
        throw `Failed to get cad version, status code: ${response.StatusCode}`;
    }
};

let _formatAgentName = (agentName: string) => {
    if (agentName == "") throw "Agent name is empty";
    let lowerAgentName = agentName.toLowerCase();
    if (lowerAgentName == "solidworks" || lowerAgentName == "sw") return "SW";
    else if (lowerAgentName == "中望cad") return "ZWCAD";
    else if (lowerAgentName == "autocad") return "ZWCAD";
    else return agentName;
};

let formatAgentName = (agentName: string) => {
    let result = _formatAgentName(agentName);
    console.log(`Formatting agent name: ${agentName} -> ${result}`);
    return result;
};

let main = async () => {
    let input = await Json.LoadAsync(inputPath) as RawJson;
    let filePaths = input.Documents.map(x => x.FilePath);
    let cadVersions = await getCadVersion({ Inputs: filePaths });
    let mapAgentNameToDocuments = {} as { [key: string]: RawJson };
    for (let doc of input.Documents) {
        let cadVersion = cadVersions.CadInfomations.find(x => x.FilePath.replace("\\", "/").toLowerCase() == doc.FilePath.replace("\\", "/").toLowerCase());
        if (cadVersion == undefined) {
            throw `Cannot find cad version for ${doc.FilePath}`;
        }
        let agentName = cadVersion.RecommendedCad.Name;

        if (mapAgentNameToDocuments[agentName] == undefined) {
            mapAgentNameToDocuments[agentName] = {
                DocInfo: input.DocInfo,
                Documents: []
            };
        }
        mapAgentNameToDocuments[agentName].Documents.push(doc);
    }
    let agentNames = Object.keys(mapAgentNameToDocuments);
    for (let agentName of agentNames) {
        let pluginName = formatAgentName(agentName) + "WriteRawJson";
        let response = await apis.runAsync("run", {
            PluginName: pluginName,
            Input: mapAgentNameToDocuments[agentName]
        });
        if (response.StatusCode == 200) {
            let msg = response.Body as WebMessage;
            if (msg.success) {
                console.log(`Successfully write raw json for ${agentName}, ${mapAgentNameToDocuments[agentName]}`);
            }
            else {
                console.log(response.Body);
                throw msg.message;
            }
        }
        else {
            throw `Failed to write raw json, status code: ${response.StatusCode}`;
        }
    }
    await File.WriteAllTextAsync(outputPath, JSON.stringify({

    }), utf8);
};

await main();


